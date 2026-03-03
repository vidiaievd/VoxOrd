import { open } from '@op-engineering/op-sqlite';

export type DB = ReturnType<typeof open>;