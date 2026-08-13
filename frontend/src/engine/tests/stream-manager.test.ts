import { describe, it, expect, beforeEach } from 'vitest';
import { StreamManager } from '../stream-manager';

// Minimal fake XMLHttpRequest to exercise StreamManager without a browser.
class FakeXHR {
  static instances: FakeXHR[] = [];
  url = '';
  method = '';
  responseType = '';
  status = 200;
  aborted = false;
  sentBody: unknown = null;
  upload: { onprogress: ((e: { loaded: number }) => void) | null } = { onprogress: null };
  onprogress: ((e: { loaded: number }) => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;

  constructor() { FakeXHR.instances.push(this); }

  open(method: string, url: string) { this.method = method; this.url = url; }
  send(body?: unknown) { this.sentBody = body; }
  abort() { this.aborted = true; }

  // test helpers
  fireProgress(loaded: number) { this.onprogress?.({ loaded }); }
  fireUploadProgress(loaded: number) { this.upload.onprogress?.({ loaded }); }
  fireLoad() { this.onload?.(); }
  fireError() { this.onerror?.(); }
}

beforeEach(() => {
  FakeXHR.instances = [];
  (globalThis as any).XMLHttpRequest = FakeXHR as any;
});

describe('StreamManager', () => {
  it('creates a download stream and tracks it as active', () => {
    const sm = new StreamManager();
    const id = sm.createDownloadStream('/api/download', {
      onProgress: () => {}, onComplete: () => {}, onError: () => {},
    });
    expect(id).toBeGreaterThan(0);
    expect(sm.activeCount()).toBe(1);
    expect(FakeXHR.instances[0].method).toBe('GET');
    expect(FakeXHR.instances[0].url).toContain('/api/download');
    sm.abortAll();
    expect(sm.activeCount()).toBe(0);
  });

  it('reports progress and completes a download stream', () => {
    const sm = new StreamManager();
    let lastLoaded = 0;
    let completed = 0;
    sm.createDownloadStream('/api/download', {
      onProgress: (l) => { lastLoaded = l; },
      onComplete: () => { completed++; },
      onError: () => {},
    });
    const xhr = FakeXHR.instances[0];
    xhr.fireProgress(500);
    expect(lastLoaded).toBe(500);
    xhr.fireLoad();
    expect(completed).toBe(1);
    // on success the stream is removed from manager
    expect(sm.activeCount()).toBe(0);
  });

  it('reports upload progress from the upload channel', () => {
    const sm = new StreamManager();
    let lastLoaded = 0;
    sm.createUploadStream('/api/upload', new Blob(['x']), {
      onProgress: (l) => { lastLoaded = l; },
      onComplete: () => {}, onError: () => {},
    });
    const xhr = FakeXHR.instances[0];
    expect(xhr.method).toBe('POST');
    xhr.fireUploadProgress(1234);
    expect(lastLoaded).toBe(1234);
  });

  it('calls onError and removes stream on network failure', () => {
    const sm = new StreamManager();
    let err = '';
    sm.createDownloadStream('/api/download', {
      onProgress: () => {}, onComplete: () => {},
      onError: (e) => { err = e; },
    });
    const xhr = FakeXHR.instances[0];
    xhr.fireError();
    expect(err).toContain('network');
    expect(sm.activeCount()).toBe(0);
  });

  it('calls onError with HTTP status for non-2xx', () => {
    const sm = new StreamManager();
    let err = '';
    sm.createDownloadStream('/api/download', {
      onProgress: () => {}, onComplete: () => {},
      onError: (e) => { err = e; },
    });
    const xhr = FakeXHR.instances[0];
    xhr.status = 500;
    xhr.fireLoad();
    expect(err).toContain('500');
    expect(sm.activeCount()).toBe(0);
  });

  it('aborts a single stream by id', () => {
    const sm = new StreamManager();
    const id = sm.createDownloadStream('/api/download', {
      onProgress: () => {}, onComplete: () => {}, onError: () => {},
    });
    sm.abortStream(id);
    expect(FakeXHR.instances[0].aborted).toBe(true);
    expect(sm.activeCount()).toBe(0);
  });

  it('abortAll clears every stream', () => {
    const sm = new StreamManager();
    sm.createDownloadStream('/api/download', { onProgress() {}, onComplete() {}, onError() {} });
    sm.createDownloadStream('/api/download', { onProgress() {}, onComplete() {}, onError() {} });
    sm.createUploadStream('/api/upload', new Blob(['x']), { onProgress() {}, onComplete() {}, onError() {} });
    expect(sm.activeCount()).toBe(3);
    sm.abortAll();
    expect(sm.activeCount()).toBe(0);
    expect(FakeXHR.instances.every((x) => x.aborted)).toBe(true);
  });
});