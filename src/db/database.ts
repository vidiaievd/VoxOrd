import { open } from '@op-engineering/op-sqlite';

const db = open({ name: 'ssz-VoxOrd.db' });

export function getDatabase() {
  return db;
}