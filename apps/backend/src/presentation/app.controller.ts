import { Controller } from '@nestjs/common';
import { TypedRoute } from '@nestia/core';

@Controller()
export class AppController {
  @TypedRoute.Get()
  getData() {
    return { message: 'Hello API' };
  }
}
