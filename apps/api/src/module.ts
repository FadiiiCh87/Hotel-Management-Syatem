import { Controller, Get, Module } from '@nestjs/common';
import { Phase1Module } from './phase1';
import { BillingModule } from './billing';
import { TaxInvoiceModule } from './tax-invoices';
@Controller('health') class HealthController { @Get() health(){return {status:'ok',service:'pk-hotels-api'};} }
@Module({imports:[Phase1Module,BillingModule,TaxInvoiceModule],controllers:[HealthController]}) export class AppModule {}
