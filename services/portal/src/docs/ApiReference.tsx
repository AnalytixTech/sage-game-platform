import spec from '../../../../docs/openapi.yaml';
import { CopyButton } from '../ui';
import { slugify } from './content';
import { highlight } from './highlight';

type Schema = { type?: string | string[]; description?: string; properties?: Record<string, Schema>; required?: string[]; items?: Schema; enum?: string[]; $ref?: string; example?: unknown; pattern?: string; minimum?: number; maximum?: number; default?: unknown };
type Param = { name: string; in: string; required?: boolean; schema?: Schema; description?: string };
type Operation = {
  tags?: string[];
  summary?: string;
  description?: string;
  security?: Record<string, unknown>[];
  parameters?: Param[];
  requestBody?: { content?: Record<string, { schema?: Schema }> };
  responses?: Record<string, { description?: string; $ref?: string; content?: Record<string, { schema?: Schema }> }>;
};
type Spec = {
  info: { title: string; description?: string };
  servers?: { url: string }[];
  tags?: { name: string; description?: string }[];
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
  'x-websocket'?: { url: string; description: string; clientMessages: Record<string, string>; serverMessages: Record<string, string> };
  'x-webhooks'?: { signature: string; events: Record<string, string> };
};

const S = spec as unknown as Spec;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const resolve = (s?: Schema): Schema | undefined => (s?.$ref ? S.components.schemas[s.$ref.split('/').pop()!] : s);
const typeOf = (s?: Schema): string => {
  const r = resolve(s);
  if (!r) return '';
  if (r.enum) return r.enum.map((v) => `"${v}"`).join(' | ');
  const t = Array.isArray(r.type) ? r.type.join(' | ') : r.type ?? 'object';
  return t === 'array' ? `${typeOf(r.items)}[]` : t;
};

function authOf(op: Operation): string {
  const kinds = (op.security ?? []).flatMap((s) => Object.keys(s));
  if (!kinds.length) return 'Public';
  return kinds.map((k) => (k === 'apiKey' ? 'API key' : k === 'sessionToken' ? 'Session token' : k)).join(' or ') + ((op.security ?? []).some((s) => !Object.keys(s).length) ? ' (optional)' : '');
}

/** A curl call with the right auth header and a minimal body. */
function curlFor(method: string, path: string, op: Operation, base: string): string {
  const auth = authOf(op);
  const token = auth.startsWith('Session') ? '$SESSION_TOKEN' : '$SAGEGAMES_API_KEY';
  const body = resolve(op.requestBody?.content?.['application/json']?.schema);
  const example = body?.required?.length
    ? JSON.stringify(Object.fromEntries(body.required.map((k) => [k, resolve(body.properties?.[k])?.example ?? (typeOf(body.properties?.[k]) === 'object' ? {} : `<${k}>`)])))
    : null;
  const lines = [`curl -X ${method.toUpperCase()} ${base}${path.replace(/\{(\w+)\}/g, '<$1>')}`];
  if (auth !== 'Public') lines.push(`  -H "Authorization: Bearer ${token}"`);
  if (example) lines.push(`  -H "Content-Type: application/json" -d '${example}'`);
  return lines.join(' \\\n');
}

function Fields({ schema }: { schema?: Schema }) {
  const r = resolve(schema);
  if (!r?.properties) return null;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
        <tbody>
          {Object.entries(r.properties).map(([name, p]) => (
            <tr key={name}>
              <td><code>{name}</code>{r.required?.includes(name) && <span className="badge" style={{ marginLeft: 6 }}>required</span>}</td>
              <td className="small">{typeOf(p)}</td>
              <td className="small">{resolve(p)?.description ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const apiOperations = () =>
  Object.entries(S.paths).flatMap(([path, ops]) =>
    Object.entries(ops)
      .filter(([m]) => METHODS.includes(m))
      .map(([method, op]) => ({ method, path, op, id: slugify(`${method} ${path}`) }))
  );

export function ApiReference({ apiBaseUrl }: { apiBaseUrl: string | null }) {
  const base = apiBaseUrl ?? S.servers?.[0]?.url ?? '';
  const ops = apiOperations();
  const tags = S.tags ?? [];
  return (
    <div className="prose">
      <h1 id="api-reference">API reference</h1>
      <p>{S.info.description?.split('\n').join(' ')}</p>
      <p className="muted small">
        Base URL <code>{base}</code>. Errors are JSON: <code>{'{ "error": "…", "code": "…" }'}</code>.
      </p>
      {tags.map((tag) => (
        <section key={tag.name}>
          <h2 id={slugify(tag.name)}>{tag.name}</h2>
          {tag.description && <p className="muted">{tag.description}</p>}
          {ops
            .filter((o) => o.op.tags?.includes(tag.name))
            .map(({ method, path, op, id }) => {
              const curl = curlFor(method, path, op, base);
              const body = op.requestBody?.content?.['application/json']?.schema;
              return (
                <article key={id} id={id} className="api-op card">
                  <div className="row wrap" style={{ alignItems: 'center' }}>
                    <span className={`method ${method}`}>{method.toUpperCase()}</span>
                    <code className="api-path">{path}</code>
                    <span className="badge">{authOf(op)}</span>
                  </div>
                  <h3 style={{ margin: '10px 0 4px' }}>{op.summary}</h3>
                  {op.description && <p className="muted small" style={{ marginTop: 0 }}>{op.description}</p>}
                  {!!op.parameters?.length && (
                    <>
                      <p className="label">Parameters</p>
                      <div className="table-wrap">
                        <table>
                          <thead><tr><th>Name</th><th>In</th><th>Type</th></tr></thead>
                          <tbody>
                            {op.parameters.map((p) => (
                              <tr key={`${p.in}-${p.name}`}>
                                <td><code>{p.name}</code>{p.required && <span className="badge" style={{ marginLeft: 6 }}>required</span>}</td>
                                <td className="small">{p.in}</td>
                                <td className="small">{typeOf(p.schema)}{p.schema?.default !== undefined ? ` (default ${String(p.schema.default)})` : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {body && (
                    <>
                      <p className="label">Body</p>
                      <Fields schema={body} />
                    </>
                  )}
                  <p className="label">Responses</p>
                  <ul className="small" style={{ margin: 0 }}>
                    {Object.entries(op.responses ?? {}).map(([code, r]) => (
                      <li key={code}>
                        <code>{code}</code> {r.$ref ? 'Error' : r.description}
                      </li>
                    ))}
                  </ul>
                  <div className="doc-code" style={{ marginTop: 12 }}>
                    <div className="doc-code-bar">
                      <span>curl</span>
                      <CopyButton text={curl} />
                    </div>
                    <pre><code dangerouslySetInnerHTML={{ __html: highlight(curl, 'bash') }} /></pre>
                  </div>
                </article>
              );
            })}
        </section>
      ))}

      {S['x-websocket'] && (
        <section>
          <h2 id="battle-websocket">Battle WebSocket</h2>
          <p>{S['x-websocket'].description}</p>
          <p className="label">URL</p>
          <p><code>{base.replace(/^http/, 'ws')}{S['x-websocket'].url}</code></p>
          {(['clientMessages', 'serverMessages'] as const).map((k) => (
            <div key={k}>
              <p className="label">{k === 'clientMessages' ? 'Client → server' : 'Server → client'}</p>
              <div className="table-wrap">
                <table>
                  <tbody>
                    {Object.entries(S['x-websocket']![k]).map(([name, shape]) => (
                      <tr key={name}><td><code>{name}</code></td><td className="small"><code>{shape}</code></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      )}

      {S['x-webhooks'] && (
        <section>
          <h2 id="webhooks">Webhooks</h2>
          <p><code>{S['x-webhooks'].signature}</code></p>
          <div className="table-wrap">
            <table>
              <tbody>
                {Object.entries(S['x-webhooks'].events).map(([name, text]) => (
                  <tr key={name}><td><code>{name}</code></td><td className="small">{text}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
