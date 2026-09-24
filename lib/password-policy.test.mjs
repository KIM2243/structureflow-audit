import test from 'node:test';
import assert from 'node:assert/strict';
import {validPassword} from './password-policy.ts';
test('minimum ten characters and punctuation or symbol, no mandatory letters or digits',()=>{
 for(const p of ['123456789!','abcdefghij!','1234567890@#','!!!!!!!!!!'])assert.equal(validPassword(p),true);
 for(const p of ['12345678!','abcdefghij','1234567890','abcdefghij ',''])assert.equal(validPassword(p),false);
});
