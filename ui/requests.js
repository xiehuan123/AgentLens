/* Classify request evidence from recorded inputs. No network traffic is intercepted. */
function requestEvidence(step) {
  if (step.diagnostic === 'model_response' || step.diagnostic === 'stream_error' || step.requestId) {
    return { type: 'model', method: null, targets: [] };
  }
  const args = objectArgs(step.args);
  const name = String(step.tool ?? '').toLowerCase();
  const namespace = step.namespace ?? '';
  const signature = [namespace, name].join(' ');
  const web = step.network || /\b(?:web_search|websearch|webfetch|web_fetch|open_url)\b/.test(signature) ||
    /^(?:web__|browser__)/.test(namespace);
  const code = step.command ?? step.script ?? '';
  const http = /(?:^|[\s_-])(?:curl|wget|http_request|fetch_url)(?:$|[\s_-])/.test(signature) ||
    /(?:^|[\s;&|])(?:curl|wget)\s/.test(code) || /\bfetch\s*\(\s*['"`]https?:\/\//.test(code);
  const direct = [args.url,args.uri,args.endpoint,args.request?.url,...(Array.isArray(args.open)?args.open.map(item=>item?.ref_id):[])].filter(value => typeof value === 'string');
  const targets = new Set();
  for (const value of direct) {
    try {
      const url = new URL(value);
      if (url.protocol === 'http:' || url.protocol === 'https:') targets.add(value);
    } catch { /* A non-URL field is not a request target. */ }
  }
  if (http && code) {
    for (const match of code.matchAll(/https?:\/\/[^\s'"`|<>;]+/gi)) targets.add(match[0]);
  }
  if (!web && !http && !targets.size) return null;
  const method = args.method ?? args.request?.method ??
    /(?:^|\s)(?:-X|--request)[=\s]+['"]?([A-Za-z]+)\b/.exec(code)?.[1];
  const result = objectArgs(step.output);
  const status = result.http_status_code ?? result.httpStatusCode;
  return { type: web ? 'web' : 'http', method: typeof method === 'string' ? method : null,
    targets: [...targets], status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null };

}
