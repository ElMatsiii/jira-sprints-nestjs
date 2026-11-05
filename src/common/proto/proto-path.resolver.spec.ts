import { resolveProtoPath } from './proto-path.resolver';
import * as fs from 'fs';

describe('resolveProtoPath', () => {
  const originalEnv = process.env.PROTO_PATH;

  afterEach(() => {
    process.env.PROTO_PATH = originalEnv;
  });

  it('should resolve sprints.proto to an existing file', () => {
    const resolved = resolveProtoPath('sprints.proto');
    expect(typeof resolved).toBe('string');
    expect(fs.existsSync(resolved)).toBe(true);
  });

  it('should resolve issues.proto to an existing file', () => {
    const resolved = resolveProtoPath('issues.proto');
    expect(typeof resolved).toBe('string');
    expect(fs.existsSync(resolved)).toBe(true);
  });

  it('should respect PROTO_PATH environment override if it exists', () => {
    const target = resolveProtoPath('sprints.proto');
    process.env.PROTO_PATH = target;
    const resolved = resolveProtoPath('other.proto');
    expect(resolved).toBe(target);
  });
});
