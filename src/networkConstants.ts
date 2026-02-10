const NETWORK_APP_ID = 'hanabi-mobile-web';

if (NETWORK_APP_ID.trim().length === 0) {
  throw new Error('NETWORK_APP_ID must not be empty');
}

export { NETWORK_APP_ID };
