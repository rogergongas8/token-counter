import { encode, decode } from 'gpt-tokenizer/encoding/cl100k_base';
export const count = (t) => encode(t, { allowedSpecial: 'all' }).length;
export const tokens = (t) => encode(t, { allowedSpecial: 'all' }).map((id) => decode([id]));
