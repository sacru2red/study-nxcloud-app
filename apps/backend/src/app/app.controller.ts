import { Controller } from '@nestjs/common';
import { AppService } from './app.service';
import { TypedParam, TypedRoute } from '@nestia/core';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @TypedRoute.Get()
  getData() {
    return this.appService.getData();
  }

  @TypedRoute.Get('/:id')
  checkIdIsNumber(@TypedParam('id') id: number) {
    console.log('id', id)    
  } 
}
