use super::{err, now};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
};
use yaml_rust2::YamlLoader;

const MAX_FILE: u64 = 512 * 1024;
const MAX_RESOURCE_BYTES: usize = 4 * 1024 * 1024;
const MAX_RESOURCES: usize = 200;

pub fn migrate(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS insight_skills (
      path TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,scope TEXT NOT NULL,
      origin TEXT NOT NULL,project TEXT NOT NULL,present INTEGER NOT NULL,
      first_seen INTEGER NOT NULL,last_changed INTEGER NOT NULL,current_version TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS insight_versions (
      path TEXT NOT NULL,hash TEXT NOT NULL,first_seen INTEGER NOT NULL,files TEXT NOT NULL,
      partial INTEGER NOT NULL, PRIMARY KEY(path,hash)
    );
    CREATE TABLE IF NOT EXISTS insight_skill_stamps (path TEXT PRIMARY KEY,stamp TEXT NOT NULL);",
    )
}

fn roots(db: &Connection) -> Result<Vec<(PathBuf, String, String)>, String> {
    let home = super::super::user_home();
    let codex = super::super::codex_home(&home);
    let mut roots = vec![
        (home.join(".agents/skills"), "user".into(), String::new()),
        (codex.join("skills"), "user".into(), String::new()),
        (
            PathBuf::from("/etc/codex/skills"),
            "admin".into(),
            String::new(),
        ),
        (codex.join("skills/.system"), "system".into(), String::new()),
        (codex.join("plugins/cache"), "plugin".into(), String::new()),
    ];
    let mut query=db.prepare("SELECT DISTINCT cwd FROM catalog WHERE cwd<>'' UNION SELECT DISTINCT cwd FROM sources WHERE cwd<>''").map_err(err)?;
    let observed = query
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(err)?;
    let mut seen = HashSet::new();
    for directory in observed
        .into_iter()
        .map(PathBuf::from)
        .chain(std::env::current_dir().ok())
    {
        if !directory.is_absolute() {
            continue;
        }
        let repository = directory
            .ancestors()
            .find(|path| path.join(".git").exists())
            .unwrap_or(&directory);
        for parent in directory.ancestors() {
            if seen.insert(parent.to_path_buf()) {
                roots.push((
                    parent.join(".agents/skills"),
                    "project".into(),
                    repository.to_string_lossy().into_owned(),
                ));
            }
            if parent == repository {
                break;
            }
        }
    }
    Ok(roots)
}

fn discover(
    directory: &Path,
    visited: &mut HashSet<PathBuf>,
    depth: usize,
    paths: &mut Vec<PathBuf>,
    errors: &mut usize,
) {
    if depth > 12 {
        return;
    }
    let canonical = match directory.canonicalize() {
        Ok(path) => path,
        Err(e) => {
            if e.kind() != io::ErrorKind::NotFound {
                *errors += 1;
            }
            return;
        }
    };
    if !visited.insert(canonical) {
        return;
    }
    let indicator = directory.join("SKILL.md");
    if indicator.is_file() {
        paths.push(indicator);
        return;
    }
    let entries = match fs::read_dir(directory) {
        Ok(value) => value,
        Err(e) => {
            if e.kind() != io::ErrorKind::NotFound {
                *errors += 1;
            }
            return;
        }
    };
    for entry in entries {
        let Ok(entry) = entry else {
            *errors += 1;
            continue;
        };
        let name = entry.file_name();
        if name.to_string_lossy().starts_with('.')
            || matches!(
                name.to_str(),
                Some("node_modules" | "target" | "__pycache__")
            )
        {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            discover(&path, visited, depth + 1, paths, errors);
        } else if entry.file_type().is_ok_and(|kind| kind.is_symlink()) && !path.exists() {
            *errors += 1;
        }
    }
}

fn readable(path: &Path) -> io::Result<String> {
    let mut bytes = Vec::new();
    fs::File::open(path)?
        .take(MAX_FILE + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_FILE {
        return Err(io::Error::other("File exceeds snapshot limit"));
    }
    String::from_utf8(bytes).map_err(io::Error::other)
}

fn resources(
    root: &Path,
    directory: &Path,
    files: &mut BTreeMap<String, (PathBuf, String)>,
    size: &mut usize,
    partial: &mut bool,
) {
    let Ok(entries) = fs::read_dir(directory) else {
        *partial = true;
        return;
    };
    for entry in entries {
        let Ok(entry) = entry else {
            *partial = true;
            continue;
        };
        let name = entry.file_name();
        if name.to_string_lossy().starts_with('.')
            || matches!(
                name.to_str(),
                Some("node_modules" | "target" | "__pycache__" | "secrets" | "credentials")
            )
        {
            continue;
        }
        let Ok(kind) = entry.file_type() else {
            *partial = true;
            continue;
        };
        if kind.is_symlink() {
            *partial = true;
            continue;
        }
        let path = entry.path();
        if files.len() >= MAX_RESOURCES || *size >= MAX_RESOURCE_BYTES {
            *partial = true;
            return;
        }
        if kind.is_dir() {
            resources(root, &path, files, size, partial);
            continue;
        }
        if !kind.is_file() || path == root.join("SKILL.md") {
            continue;
        }
        let extension = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or_default();
        if !matches!(
            extension,
            "md" | "txt"
                | "json"
                | "yaml"
                | "yml"
                | "toml"
                | "py"
                | "js"
                | "ts"
                | "sh"
                | "ps1"
                | "rs"
                | "csv"
                | "html"
                | "css"
                | "xml"
        ) {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            *partial = true;
            continue;
        };
        if metadata.len() > MAX_FILE || *size + metadata.len() as usize > MAX_RESOURCE_BYTES {
            *partial = true;
            continue;
        }
        *size += metadata.len() as usize;
        files.insert(
            path.strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/"),
            (path, super::stamp(&metadata)),
        );
    }
}

fn frontmatter(text: &str) -> (Option<String>, String) {
    let mut lines = text.trim_start_matches('\u{feff}').lines();
    if lines.next() != Some("---") {
        return (None, String::new());
    }
    let yaml = lines
        .take_while(|line| line.trim() != "---")
        .collect::<Vec<_>>()
        .join("\n");
    let Ok(items) = YamlLoader::load_from_str(&yaml) else {
        return (None, String::new());
    };
    let Some(item) = items.first() else {
        return (None, String::new());
    };
    (
        item["name"]
            .as_str()
            .filter(|s| !s.trim().is_empty())
            .map(str::to_owned),
        item["description"].as_str().unwrap_or_default().to_owned(),
    )
}

pub fn scan(db: &mut Connection) -> Result<Value, String> {
    let all_roots = roots(db)?;
    scan_roots(db, &all_roots)
}

fn scan_roots(
    db: &mut Connection,
    all_roots: &[(PathBuf, String, String)],
) -> Result<Value, String> {
    let previous = {
        let mut q = db
            .prepare("SELECT path,stamp FROM insight_skill_stamps")
            .map_err(err)?;
        let rows = q
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(err)?;
        rows.collect::<Result<BTreeMap<_, _>, _>>().map_err(err)?
    };
    let mut known = BTreeMap::new();
    let mut errors = 0;
    let mut updated = 0;
    for (root, scope, project) in all_roots {
        let start_errors = errors;
        let mut paths = Vec::new();
        discover(root, &mut HashSet::new(), 0, &mut paths, &mut errors);
        known.insert(root.clone(), errors == start_errors);
        for path in paths {
            let parent = path.parent().ok_or("Invalid skill directory.")?;
            let key = path.to_string_lossy().replace('\\', "/");
            let origin = root.to_string_lossy().replace('\\', "/");
            let Ok(meta) = path.metadata() else {
                errors += 1;
                known.insert(root.clone(), false);
                continue;
            };
            if meta.len() > MAX_FILE {
                errors += 1;
                known.insert(root.clone(), false);
                continue;
            }
            let mut size = meta.len() as usize;
            let mut paths =
                BTreeMap::from([("SKILL.md".into(), (path.clone(), super::stamp(&meta)))]);
            let mut partial = false;
            resources(parent, parent, &mut paths, &mut size, &mut partial);
            let signature = serde_json::to_string(&(
                partial,
                paths
                    .iter()
                    .map(|(key, (_, stamp))| (key, stamp))
                    .collect::<Vec<_>>(),
            ))
            .map_err(err)?;
            if previous.get(&key) == Some(&signature) {
                db.execute(
                    "UPDATE insight_skills SET present=1 WHERE path=?1 AND present=0",
                    [&key],
                )
                .map_err(err)?;
                continue;
            }
            let Ok(content) = readable(&path) else {
                errors += 1;
                known.insert(root.clone(), false);
                continue;
            };
            let (name, description) = frontmatter(&content);
            let name = name.unwrap_or_else(|| {
                parent
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned()
            });
            let mut files = BTreeMap::from([("SKILL.md".into(), content)]);
            for (name, (path, _)) in paths {
                if name == "SKILL.md" {
                    continue;
                }
                match readable(&path) {
                    Ok(text) => {
                        files.insert(name, text);
                    }
                    Err(_) => {
                        partial = true;
                    }
                }
            }
            let contents = serde_json::to_string(&files).map_err(err)?;
            let digest = format!("{:x}", Sha256::digest(contents.as_bytes()));
            let tx = db.transaction().map_err(err)?;
            tx.execute(
                "INSERT OR IGNORE INTO insight_versions VALUES (?1,?2,?3,?4,?5)",
                params![key, digest, now(), contents, partial],
            )
            .map_err(err)?;
            tx.execute("INSERT INTO insight_skills VALUES (?1,?2,?3,?4,?5,?6,1,?7,?7,?8)
             ON CONFLICT(path) DO UPDATE SET name=excluded.name,description=excluded.description,
             scope=excluded.scope,origin=excluded.origin,project=excluded.project,present=1,
             last_changed=CASE WHEN current_version=excluded.current_version THEN last_changed ELSE excluded.last_changed END,current_version=excluded.current_version",
             params![key,name,description,scope,origin,project,now(),digest]).map_err(err)?;
            if !partial {
                tx.execute("INSERT INTO insight_skill_stamps VALUES (?1,?2) ON CONFLICT(path) DO UPDATE SET stamp=excluded.stamp",
                    params![key,signature]).map_err(err)?;
            } else {
                tx.execute("DELETE FROM insight_skill_stamps WHERE path=?1", [&key])
                    .map_err(err)?;
            }
            tx.commit().map_err(err)?;
            updated += 1;
        }
    }
    let tracked = {
        let mut q = db
            .prepare("SELECT path,origin FROM insight_skills WHERE present=1")
            .map_err(err)?;
        let rows = q
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(err)?
    };
    for (path, origin) in tracked {
        if known.get(Path::new(&origin)) == Some(&true)
            && matches!(Path::new(&path).try_exists(), Ok(false))
        {
            db.execute("UPDATE insight_skills SET present=0 WHERE path=?1", [path])
                .map_err(err)?;
        }
    }
    Ok(json!({"errors":errors,"updated":updated}))
}

pub fn skills(db: &Connection) -> Result<Value, String> {
    let mut q=db.prepare("SELECT path,name,description,scope,origin,project,present,first_seen,last_changed,current_version FROM insight_skills ORDER BY name,path").map_err(err)?;
    let rows=q.query_map([],|r|Ok(json!({"path":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"description":r.get::<_,String>(2)?,
       "scope":r.get::<_,String>(3)?,"origin":r.get::<_,String>(4)?,"project":r.get::<_,String>(5)?,"present":r.get::<_,bool>(6)?,
       "firstSeen":r.get::<_,i64>(7)?,"lastChanged":r.get::<_,i64>(8)?,"version":r.get::<_,String>(9)?}))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
    Ok(json!(rows))
}

pub fn versions(db: &Connection, path: &str) -> Result<Value, String> {
    let mut q=db.prepare("SELECT hash,first_seen,files,partial FROM insight_versions WHERE path=?1 ORDER BY first_seen DESC,rowid DESC").map_err(err)?;
    let rows=q.query_map([path],|r|{
        let files:String=r.get(2)?;
        Ok(json!({"hash":r.get::<_,String>(0)?,"firstSeen":r.get::<_,i64>(1)?,"files":serde_json::from_str::<Value>(&files).unwrap_or_default(),"partial":r.get::<_,bool>(3)?}))
    }).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
    Ok(json!(rows))
}

fn server_metadata(content: &str, source: &str, project: &str) -> Vec<Value> {
    let Ok(config) = toml::from_str::<toml::Value>(content) else {
        return Vec::new();
    };
    let Some(table) = config.get("mcp_servers").and_then(toml::Value::as_table) else {
        return Vec::new();
    };
    table.iter().filter_map(|(name,data)|{
        let data=data.as_table()?;
        let transport=if data.contains_key("url") {"http"}else if data.contains_key("command") {"stdio"}else{"unknown"};
        Some(json!({"name":name,"origin":source,"project":project,"transport":transport,
          "enabled":data.get("enabled").and_then(toml::Value::as_bool).unwrap_or(true),"runtime":"unknown"}))
    }).collect()
}

pub fn servers(db: &Connection) -> Result<Value, String> {
    let path = super::super::codex_home(&super::super::user_home()).join("config.toml");
    let mut result = readable(&path)
        .map(|text| server_metadata(&text, "Codex config.toml", ""))
        .unwrap_or_default();
    let mut q=db.prepare("SELECT DISTINCT cwd FROM catalog WHERE cwd<>'' UNION SELECT DISTINCT cwd FROM sources WHERE cwd<>''").map_err(err)?;
    let projects = q
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(err)?;
    let mut seen = HashSet::new();
    for name in projects {
        let cwd = Path::new(&name);
        if !cwd.is_absolute() {
            continue;
        }
        let root = cwd
            .ancestors()
            .find(|parent| parent.join(".git").exists())
            .unwrap_or(cwd);
        for dir in cwd.ancestors() {
            let config = dir.join(".codex/config.toml");
            if seen.insert(config.clone()) {
                if let Ok(content) = readable(&config) {
                    result.extend(server_metadata(
                        &content,
                        "Project .codex/config.toml",
                        &name,
                    ));
                }
            }
            if dir == root {
                break;
            }
        }
    }
    Ok(json!(result))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshots_preserve_scoped_names_and_deleted_versions() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let mut db = Connection::open_in_memory().unwrap();
        migrate(&db).unwrap();
        let roots = vec![
            (root.join("one"), "project".into(), "repo-1".into()),
            (root.join("two"), "project".into(), "repo-2".into()),
        ];
        for (dir, _, _) in &roots {
            fs::create_dir_all(dir.join("shared/scripts")).unwrap();
            fs::write(
                dir.join("shared/SKILL.md"),
                "---
name: shared
description: >-
  Example skill
  with metadata
---
# How to use",
            )
            .unwrap();
            fs::write(dir.join("shared/scripts/helper.py"), "print('one')").unwrap();
        }
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(root.join("one"), root.join("one/shared/cycle")).unwrap();
            std::os::unix::fs::symlink(root.join("missing"), root.join("two/broken")).unwrap();
        }
        scan_roots(&mut db, &roots).unwrap();
        let initial = skills(&db).unwrap();
        assert_eq!(initial.as_array().unwrap().len(), 2);
        assert_eq!(initial[0]["description"], "Example skill with metadata");
        let path = initial[0]["path"].as_str().unwrap();
        fs::write(root.join("one/shared/scripts/helper.py"), "print('two')").unwrap();
        scan_roots(&mut db, &roots).unwrap();
        scan_roots(&mut db, &roots).unwrap();
        assert_eq!(versions(&db, path).unwrap().as_array().unwrap().len(), 2);
        fs::remove_dir_all(root.join("one/shared")).unwrap();
        scan_roots(&mut db, &roots).unwrap();
        assert_eq!(skills(&db).unwrap()[0]["present"], false);
        assert_eq!(versions(&db, path).unwrap().as_array().unwrap().len(), 2);
    }

    #[cfg(unix)]
    #[test]
    fn discovery_follows_skill_directory_alias_and_reports_inaccessible_shape() {
        let root = tempfile::tempdir().unwrap();
        let library = root.path().join("library");
        let chosen = root.path().join("chosen");
        fs::create_dir_all(&library).unwrap();
        fs::create_dir_all(&chosen).unwrap();
        fs::write(
            library.join("SKILL.md"),
            "---\nname: linked\n---\nDocumentation",
        )
        .unwrap();
        std::os::unix::fs::symlink(&library, chosen.join("linked")).unwrap();
        let bad = root.path().join("not-a-directory");
        fs::write(&bad, "not a directory").unwrap();
        let mut db = Connection::open_in_memory().unwrap();
        migrate(&db).unwrap();
        let result = scan_roots(
            &mut db,
            &[
                (chosen, "user".into(), "".into()),
                (bad, "user".into(), "".into()),
            ],
        )
        .unwrap();
        assert_eq!(result["errors"], 1);
        assert_eq!(skills(&db).unwrap()[0]["name"], "linked");
    }

    #[test]
    fn mcp_config_never_serializes_credentials() {
        let data = server_metadata(
            "[mcp_servers.sample]
url='https://example.invalid/private?secret=xyz'
http_headers={Authorization='xyz'}
env={API_KEY='xyz'}
enabled=false",
            "local",
            "",
        );
        assert_eq!(data[0]["enabled"], false);
        assert_eq!(data[0]["transport"], "http");
        let body = json!(data).to_string();
        assert!(
            !body.contains("xyz")
                && !body.contains("Authorization")
                && !body.contains("API_KEY")
                && !body.contains("example.invalid")
        );
    }
}
