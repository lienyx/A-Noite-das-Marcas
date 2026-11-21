import { createGameServer } from '../../server.ts';

export const config = { path: ['/ws', '/api/*'] };
export default await createGameServer();
