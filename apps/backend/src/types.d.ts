import { IJwtPayload } from './common/types';

declare global {
  namespace Express {
    interface Request {
      user: IJwtPayload;
    }
  }
}
