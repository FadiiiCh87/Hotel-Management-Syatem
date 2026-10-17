import { Controller, Get, Module } from '@nestjs/common';
import { Phase1Module } from './phase1';
import { BillingModule } from './billing';
@Controller('health') class HealthController { @Get() health(){return {status:'ok',service:'pk-hotels-api'};} }
@Module({imports:[Phase1Module,BillingModule],controllers:[HealthController]}) export class AppModule {}
