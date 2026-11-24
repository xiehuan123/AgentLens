use rusqlite::{params, Connection};
use serde_json::Value;
use std::path::Path;

pub fn open(path: &Path) -> Result<Connection, String> {
    let db = Connection::open(path).map_err(|e| e.to_string())?;
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS demo_records (
           session INTEGER NOT NULL, ordinal INTEGER NOT NULL, body TEXT NOT NULL,
           PRIMARY KEY (session, ordinal)
         );
         PRAGMA user_version = 1;",
    )
    .map_err(|e| e.to_string())?;
    Ok(db)
}

pub fn demo(db: &mut Connection) -> Result<Value, String> {
    let fixture: Vec<Vec<Value>> =
        serde_json::from_str(include_str!("demo.json")).map_err(|e| e.to_string())?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    for (session, records) in fixture.iter().enumerate() {
        for (ordinal, value) in records.iter().enumerate() {
            tx.execute(
                "INSERT OR IGNORE INTO demo_records VALUES (?1, ?2, ?3)",
                params![session as i64, ordinal as i64, value.to_string()],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    let mut result = vec![Vec::new(); fixture.len()];
    let mut statement = db
        .prepare("SELECT session, body FROM demo_records ORDER BY session, ordinal")
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (session, body) = row.map_err(|e| e.to_string())?;
        let value = serde_json::from_str::<Value>(&body).map_err(|e| e.to_string())?;
        if let Some(records) = result.get_mut(session as usize) {
            records.push(value);
        }
    }
    Ok(serde_json::json!(result))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn demo_records_are_idempotent() {
        let mut db = open(Path::new(":memory:")).unwrap();
        let first = demo(&mut db).unwrap();
        assert_eq!(first, demo(&mut db).unwrap());
        assert_eq!(first[0].as_array().unwrap().len(), 11);
        assert_eq!(first[1][10]["result"]["exit"], 0);
    }
}
