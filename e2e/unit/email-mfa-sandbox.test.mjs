import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emailSandboxConfig,
  awsRequest,
  prepareIdentities,
  requireVerified,
  deliveryRequest,
} from '../helpers/email-mfa-sandbox.mjs';
const config = { from: 'example+sender@gmail.com', to: 'example+recipient@gmail.com' };
test('Gmail aliases may share an inbox but must have distinct addresses', () => {
  assert.deepEqual(emailSandboxConfig({ MFA_EMAIL_FROM: config.from, MFA_EMAIL_TO: config.to }), config);
  assert.throws(() => emailSandboxConfig({ MFA_EMAIL_FROM: config.from, MFA_EMAIL_TO: config.from }));
  assert.throws(() => emailSandboxConfig({}));
});
test('addresses use a private temporary file rather than command arguments', () => {
  let path;
  const response = awsRequest('sesv2', 'send-email', deliveryRequest(config), (_binary, args) => {
    assert.equal(args.join(' ').includes(config.from), false);
    assert.equal(
      JSON.parse(readFileSync((path = args[args.indexOf('--cli-input-json') + 1].slice(7)), 'utf8')).Destination
        .ToAddresses[0],
      config.to,
    );
    return { status: 0, stdout: '{}' };
  });
  assert.deepEqual(response, {});
  assert.equal(existsSync(path), false);
});
test('AWS failures never expose addresses or provider details', () => {
  assert.throws(
    () => awsRequest('sesv2', 'send-email', {}, () => ({ status: 1, stderr: config.from })),
    (error) => !error.message.includes(config.from),
  );
});
test('only missing SES identities receive a verification request', async () => {
  const created = [];
  const result = await prepareIdentities(config, (_service, operation, input) => {
    if (operation === 'list-email-identities')
      return { EmailIdentities: [{ IdentityName: config.from, SendingEnabled: true }] };
    created.push(input.EmailIdentity);
    return {};
  });
  assert.deepEqual(created, [config.to]);
  assert.deepEqual(
    result.map((value) => value.verificationRequested),
    [false, true],
  );
  assert.equal(JSON.stringify(result).includes(config.from), false);
});
test('both addresses must be verified before delivery', () => {
  assert.throws(() =>
    requireVerified(config, (_service, operation) =>
      operation === 'get-account'
        ? { ProductionAccessEnabled: false, SendingEnabled: true }
        : { VerifiedForSendingStatus: false },
    ),
  );
});
test('production access is outside this sandbox POC', () => {
  assert.throws(() => requireVerified(config, () => ({ ProductionAccessEnabled: true, SendingEnabled: true })));
});
test('delivery check addresses exactly one recipient and contains no authentication code', () => {
  const request = deliveryRequest(config);
  assert.deepEqual(request.Destination.ToAddresses, [config.to]);
  assert.equal(request.Content.Simple.Body.Text.Data.includes('{####}'), false);
});
