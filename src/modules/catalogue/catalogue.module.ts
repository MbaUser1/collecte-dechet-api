import { Module } from '@nestjs/common';
import { CatalogueService } from './catalogue.service.js';
import { CategoriesController } from './categories.controller.js';
import { TypesDechetsController } from './types-dechets.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [CategoriesController, TypesDechetsController],
  providers: [CatalogueService],
  exports: [CatalogueService],
})
export class CatalogueModule {}

