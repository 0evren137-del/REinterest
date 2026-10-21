import { emptyData, validateData } from './domain.js';

// The UI talks only to this adapter. A future cloud adapter can keep this contract.
const KEY = 'reinterest.local.v1';
export class LocalRepository {
  baseline = null;
  async load() {
    const text = localStorage.getItem(KEY);
    this.baseline = text;
    return text ? validateData(JSON.parse(text)) : emptyData();
  }
  async save(data) {
    const checked = validateData(data);
    if (localStorage.getItem(KEY) !== this.baseline) throw new Error('另一个标签页已修改数据。请先导出当前备份，再刷新页面后重试。');
    const text = JSON.stringify(checked);
    localStorage.setItem(KEY, text);
    this.baseline = text;
    return checked;
  }
  async export(data) {
    return JSON.stringify({ ...validateData(data), exportedAt: new Date().toISOString() }, null, 2);
  }
  async import(text) {
    if (text.length > 20_000_000) throw new Error('备份文件过大，最大支持 20MB');
    return validateData(JSON.parse(text));
  }
}
