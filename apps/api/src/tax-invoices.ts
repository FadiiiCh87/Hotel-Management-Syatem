import { Controller, Get, Module, Param, Req, UseGuards, CanActivate, ExecutionContext, Injectable, UnauthorizedException, BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { Pool } from 'pg';
import * as jwt from 'jsonwebtoken';
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,ssl:process.env.PGSSL==='true'?{rejectUnauthorized:true}:undefined});
type Staff={sub:string;hotelId:string;role:string};
@Injectable() class DraftAuth implements CanActivate {
 async canActivate(ctx:ExecutionContext){const req=ctx.switchToHttp().getRequest();const auth=String(req.headers.authorization||'');
 if(!auth.startsWith('Bearer '))throw new UnauthorizedException();
 try{req.staff=jwt.verify(auth.slice(7),process.env.JWT_SECRET!,{algorithms:['HS256'],issuer:'pk-hotels-api',audience:'pk-hotels-staff'}) as Staff;const active=await pool.query('SELECT 1 FROM staff WHERE id=$1 AND hotel_id=$2 AND active=true AND role=$3',[req.staff.sub,req.staff.hotelId,req.staff.role]);if(!active.rowCount)throw new UnauthorizedException();return true;}
 catch{throw new UnauthorizedException();}}
}
@Controller('tax-and-invoices') @UseGuards(DraftAuth)
class TaxInvoiceController {
 @Get('status') async status(@Req() req:any){
  const u=req.staff as Staff;
  const r=await pool.query('SELECT registration_status,vat_rate,tax_registration_number,tax_reviewed_at FROM billing_settings WHERE hotel_id=$1',[u.hotelId]);
  const settings=r.rows[0]||{registration_status:'UNCONFIRMED',vat_rate:null,tax_registration_number:null,tax_reviewed_at:null};
  return {registrationStatus:settings.registration_status,vatRate:settings.vat_rate,taxRegistrationNumberPresent:Boolean(settings.tax_registration_number),taxReviewedAt:settings.tax_reviewed_at,officialInvoiceIssuanceEnabled:false};
 }
 @Get('folios/:folioId/statement-preview') async preview(@Param('folioId',new ParseUUIDPipe()) folioId:string,@Req() req:any){
  const u=req.staff as Staff;
  const f=await pool.query(`SELECT f.id,f.status,f.reservation_id,h.name AS hotel_name,h.currency,g.full_name AS guest_name,rm.number AS room_number
   FROM folios f JOIN hotels h ON h.id=f.hotel_id JOIN reservations r ON r.id=f.reservation_id AND r.hotel_id=f.hotel_id
   JOIN guests g ON g.id=r.guest_id AND g.hotel_id=f.hotel_id
   JOIN rooms rm ON rm.id=r.room_id AND rm.hotel_id=f.hotel_id
   WHERE f.id=$1 AND f.hotel_id=$2`,[folioId,u.hotelId]);
  if(!f.rows.length)throw new BadRequestException('Folio not found');
  const lines=await pool.query('SELECT line_type,description,quantity,unit_price_sar,amount_sar,direction FROM folio_lines WHERE hotel_id=$1 AND folio_id=$2 ORDER BY created_at,id',[u.hotelId,folioId]);
  const payments=await pool.query('SELECT amount_sar,method,recorded_at FROM folio_payments WHERE hotel_id=$1 AND folio_id=$2 ORDER BY recorded_at,id',[u.hotelId,folioId]);
  const settings=await pool.query('SELECT registration_status FROM billing_settings WHERE hotel_id=$1',[u.hotelId]);
  const net=lines.rows.reduce((n:number,l:any)=>n+Math.round(Number(l.amount_sar)*100)*Number(l.direction),0);
  const paid=payments.rows.reduce((n:number,p:any)=>n+Math.round(Number(p.amount_sar)*100),0);
  return {documentType:'INTERNAL_STATEMENT_PREVIEW',watermark:'DRAFT - NOT A TAX INVOICE',invoiceNumber:null,officialInvoice:false,hotel:f.rows[0].hotel_name,currency:'SAR',guest:f.rows[0].guest_name,room:f.rows[0].room_number,folioId,lines:lines.rows,payments:payments.rows,subtotalBeforeTaxSar:(net/100).toFixed(2),recordedPaymentsSar:(paid/100).toFixed(2),balanceBeforeTaxSar:((net-paid)/100).toFixed(2),vatRate:null,vatAmountSar:null,totalIncludingTaxSar:null,taxStatus:settings.rows[0]?.registration_status||'UNCONFIRMED',issuanceBlocked:true,blockReason:'VAT registration and tax treatment not verified; ZATCA invoice implementation not completed'};
 }
}
@Module({controllers:[TaxInvoiceController],providers:[DraftAuth]}) export class TaxInvoiceModule {}
