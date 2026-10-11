import { Controller, Get } from '@nestjs/common';

@Controller('sante')
export class SanteController {
  @Get()
  verifier() {
    return {
      success: true,
      message: 'API opérationnelle.',
      data: {
        service: 'collecte-dechets-api',
        version: '1.0.0',
        statut: 'OPERATIONNEL',
      },
    };
  }
}