import * as path from 'path';
import * as fs from 'fs';

export function resolveProtoPath(protoFileName: string): string {
  const candidates = [
    // 1. Environment variable override
    process.env.PROTO_PATH,
    process.env.PROTO_DIR ? path.join(process.env.PROTO_DIR, protoFileName) : undefined,
    // 2. Relative to current file (__dirname)
    path.join(__dirname, '..', '..', 'protos', protoFileName),
    path.join(__dirname, '..', 'protos', protoFileName),
    path.join(__dirname, 'protos', protoFileName),
    // 3. Relative to process.cwd()
    path.join(process.cwd(), 'src', 'protos', protoFileName),
    path.join(process.cwd(), 'protos', protoFileName),
    path.join(process.cwd(), 'dist', 'src', 'protos', protoFileName),
    path.join(process.cwd(), 'dist', 'protos', protoFileName),
    // 4. Sibling repository (local dev / monorepo)
    path.join(process.cwd(), '..', 'jira-contracts', 'protos', protoFileName),
    path.join(__dirname, '..', '..', '..', 'jira-contracts', 'protos', protoFileName),
    // 5. Node modules
    path.join(process.cwd(), 'node_modules', 'jira-contracts', 'protos', protoFileName),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return path.resolve(candidate);
    }
  }

  // Fallback to local src/protos
  return path.resolve(process.cwd(), 'src', 'protos', protoFileName);
}
