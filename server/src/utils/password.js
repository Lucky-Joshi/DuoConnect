import bcrypt from 'bcryptjs';

const ROUNDS = 12;
const FALLBACK_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.9Fc9p7J5g9Xk4vF9R8rN2w7zP7uJ0Gy';

export function hashPassword(password) {
  return bcrypt.hash(password, ROUNDS);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export async function burnPasswordCheck(password) {
  await bcrypt.compare(password, FALLBACK_HASH);
  return false;
}
