import { test, expect } from '@playwright/test';
import Ajv from 'ajv';

test.describe('JSON Tests', () => {
  const ajv = new Ajv();

  test('Teams', async ({ request }) => {
    const response = await (await request.get('https://alehouse.rocks/api/beers.json')).json();
    const valid = ajv.validate(require('./beers.schema.json'), response);

    if (!valid) {
      console.error('AJV Validation Errors:', ajv.errorsText());
    }

    expect(valid).toBe(true);
  });
});
