import { Controller, Get, Module } from '@nestjs/common';
import { Phase1Module } from './phase1';
@Controller('health') class HealthController { @Get() health(){return {status:'ok',service:'pk-hotels-api'};} }
@Module({imports:[Phase1Module],controllers:[HealthController]}) export class AppModule {}
