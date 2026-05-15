import { Controller } from '@nestjs/common'
import { TypedRoute } from '@nestia/core'

@Controller()
export class AppController {
  @TypedRoute.Get()
  getData(): { message: string } {
    return { message: 'Hello API' }
  }
}
