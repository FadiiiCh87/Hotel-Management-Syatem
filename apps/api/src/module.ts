import { GuestBookingModule } from './guest-bookings';
import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { Phase1Module } from './phase1';
import { BillingModule } from './billing';
import { TaxInvoiceModule } from './tax-invoices';
const healthPool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:3000,ssl:process.env.PGSSL==='true'?{rejectUnauthorized:true,ca:process.env.PGSSL_CA||undefined}:undefined});
@Controller('health') class HealthController {
 @Get() health(){return {status:'ok',service:'pk-hotels-api'};}
 @Get('ready') async ready(){if(!process.env.DATABASE_URL||!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32)throw new ServiceUnavailableException('Required service configuration is missing');try{await healthPool.query('SELECT 1');return {status:'ready',database:'connected'};}catch{throw new ServiceUnavailableException('Database connection unavailable');}}
}
@Module({imports:[Phase1Module,BillingModule,TaxInvoiceModule,GuestBookingModule],controllers:[HealthController]}) export class AppModule {}
