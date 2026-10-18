import { Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Injectable, Module, Param, Post, UnauthorizedException, UseGuards, BadRequestException, ConflictException, Req, ParseUUIDPipe } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import * as jwt from 'jsonwebtoken';
import { IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,ssl:process.env.PGSSL==='true'?{rejectUnauthorized:true,ca:process.env.PGSSL_CA||undefined}:undefined});
type Staff={sub:string;hotelId:string;role:string};
@Injectable() class BillingAuth implements CanActivate {
 async canActivate(ctx:ExecutionContext){const req=ctx.switchToHttp().getRequest();const auth=String(req.headers.authorization||'');
 if(!auth.startsWith('Bearer '))throw new UnauthorizedException();
 try{req.staff=jwt.verify(auth.slice(7),process.env.JWT_SECRET!,{algorithms:['HS256'],issuer:'pk-hotels-api',audience:'pk-hotels-staff'}) as Staff;const active=await pool.query('SELECT 1 FROM staff WHERE id=$1 AND hotel_id=$2 AND active=true AND role=$3',[req.staff.sub,req.staff.hotelId,req.staff.role]);if(!active.rowCount)throw new UnauthorizedException();return true;}catch{throw new UnauthorizedException();}}
}
class LineDto {
 @IsIn(['SERVICE','DISCOUNT','ADJUSTMENT']) type!:'SERVICE'|'DISCOUNT'|'ADJUSTMENT';
 @IsString() @IsNotEmpty() @MaxLength(200) description!:string;
 @IsNumberString() quantity!:string;
 @IsNumberString() unitPriceSar!:string;
}
class PaymentDto {
 @IsNumberString() amountSar!:string;
 @IsIn(['CASH','BANK_TRANSFER','CARD_EXTERNAL']) method!:'CASH'|'BANK_TRANSFER'|'CARD_EXTERNAL';
 @IsOptional() @IsString() @MaxLength(100) reference?:string;
 @IsUUID() idempotencyKey!:string;
}
const amount=(s:string)=>{if(!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(s))throw new BadRequestException('Use a nonnegative SAR amount with at most 2 decimals');return s;};
async function tx<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
@Controller('billing') @UseGuards(BillingAuth)
class BillingController {
 private staff(req:any):Staff{return req.staff;}
 @Get('reservations/:reservationId/folio') async find(@Param('reservationId',new ParseUUIDPipe()) id:string,@Req() req:any){const u=this.staff(req);const r=await pool.query('SELECT id AS "folioId" FROM folios WHERE reservation_id=$1 AND hotel_id=$2',[id,u.hotelId]);if(!r.rowCount)throw new BadRequestException('Folio not found');return r.rows[0];}
 @Post('reservations/:reservationId/folio')
 async open(@Param('reservationId',new ParseUUIDPipe()) reservationId:string,@Body() _body:Record<string,never>,@Req() req:any){
  const u=this.staff(req);if(!['ADMIN','MANAGER','RECEPTIONIST'].includes(u.role))throw new ForbiddenException();
  return tx(async c=>{
   const r=await c.query('SELECT id,arrival_date,departure_date,nightly_rate FROM reservations WHERE id=$1 AND hotel_id=$2 AND status IN (\'CONFIRMED\',\'CHECKED_IN\') FOR UPDATE',[reservationId,u.hotelId]);
   if(!r.rows.length)throw new BadRequestException('Eligible reservation not found');
   const row=r.rows[0];
   const folio=await c.query('INSERT INTO folios(hotel_id,reservation_id) VALUES($1,$2) ON CONFLICT(hotel_id,reservation_id) DO UPDATE SET reservation_id=EXCLUDED.reservation_id RETURNING id,status',[u.hotelId,reservationId]);
   const f=folio.rows[0];if(f.status!=='OPEN')throw new ConflictException('Folio already closed');
   const nights=Number((await c.query('SELECT ($1::date-$2::date) AS nights',[row.departure_date,row.arrival_date])).rows[0].nights);
   if(!Number.isInteger(nights)||nights<1)throw new ConflictException('Invalid reservation dates');
   await c.query(`INSERT INTO folio_lines(hotel_id,folio_id,line_type,description,quantity,unit_price_sar,direction,created_by)
     SELECT $1,$2,'ROOM','Room nights',$3,$4,1,$5
     WHERE NOT EXISTS (SELECT 1 FROM folio_lines WHERE hotel_id=$1 AND folio_id=$2 AND line_type='ROOM')`,[u.hotelId,f.id,nights,row.nightly_rate,u.sub]);
   return {folioId:f.id,status:f.status,nights,nightlyRateSar:row.nightly_rate};
  });
 }
 @Get('folios/:id') async get(@Param('id',new ParseUUIDPipe()) id:string,@Req() req:any){
  const u=this.staff(req);
  const f=await pool.query('SELECT id,reservation_id,status,created_at FROM folios WHERE id=$1 AND hotel_id=$2',[id,u.hotelId]);if(!f.rows.length)throw new BadRequestException('Folio not found');
  const lines=await pool.query('SELECT id,line_type,description,quantity,unit_price_sar,amount_sar,direction FROM folio_lines WHERE folio_id=$1 AND hotel_id=$2 ORDER BY created_at,id',[id,u.hotelId]);
  const payments=await pool.query('SELECT id,amount_sar,method,reference,recorded_at FROM folio_payments WHERE folio_id=$1 AND hotel_id=$2 ORDER BY recorded_at,id',[id,u.hotelId]);
  const chargesCents=lines.rows.reduce((n:number,l:any)=>n+Math.round(Number(l.amount_sar)*100)*Number(l.direction),0);
  const paidCents=payments.rows.reduce((n:number,p:any)=>n+Math.round(Number(p.amount_sar)*100),0);
  return {...f.rows[0],currency:'SAR',lines:lines.rows,payments:payments.rows,roomAndServiceSubtotalSar:(chargesCents/100).toFixed(2),paymentsSar:(paidCents/100).toFixed(2),balanceBeforeTaxSar:((chargesCents-paidCents)/100).toFixed(2),taxStatus:'NOT_CONFIGURED',invoiceReady:false};
 }
 @Post('folios/:id/lines') async line(@Param('id',new ParseUUIDPipe()) id:string,@Body() body:LineDto,@Req() req:any){
  const u=this.staff(req);if(!['ADMIN','MANAGER','RECEPTIONIST'].includes(u.role))throw new ForbiddenException();
  const qty=amount(body.quantity),unit=amount(body.unitPriceSar);if(Number(qty)<=0)throw new BadRequestException('Quantity must be positive');
  if(body.type==='ADJUSTMENT'&&u.role==='RECEPTIONIST')throw new ForbiddenException('Manager approval required for adjustments');
  return tx(async c=>{
   const f=await c.query('SELECT status FROM folios WHERE id=$1 AND hotel_id=$2 FOR UPDATE',[id,u.hotelId]);if(!f.rows.length||f.rows[0].status!=='OPEN')throw new ConflictException('Open folio required');
   const direction=body.type==='DISCOUNT'?-1:1;
   const r=await c.query('INSERT INTO folio_lines(hotel_id,folio_id,line_type,description,quantity,unit_price_sar,direction,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,amount_sar,direction',[u.hotelId,id,body.type,body.description,qty,unit,direction,u.sub]);
   await c.query('INSERT INTO audit_logs(hotel_id,actor_id,action,entity_id) VALUES($1,$2,$3,$4)',[u.hotelId,u.sub,'FOLIO_LINE_ADDED',r.rows[0].id]);return r.rows[0];
  });
 }
 @Post('folios/:id/payments') async payment(@Param('id',new ParseUUIDPipe()) id:string,@Body() body:PaymentDto,@Req() req:any){
  const u=this.staff(req);if(!['ADMIN','MANAGER','RECEPTIONIST'].includes(u.role))throw new ForbiddenException();
  const value=amount(body.amountSar);if(Number(value)<=0)throw new BadRequestException('Payment must be positive');
  if(body.method==='CARD_EXTERNAL'&&!body.reference)throw new BadRequestException('External card reference required');
  return tx(async c=>{
   const f=await c.query('SELECT status FROM folios WHERE id=$1 AND hotel_id=$2 FOR UPDATE',[id,u.hotelId]);if(!f.rows.length||f.rows[0].status!=='OPEN')throw new ConflictException('Open folio required');
   const existing=await c.query('SELECT id,folio_id,amount_sar,method,reference FROM folio_payments WHERE hotel_id=$1 AND idempotency_key=$2',[u.hotelId,body.idempotencyKey]);
   if(existing.rows.length){const p=existing.rows[0];if(p.folio_id!==id||Number(p.amount_sar)!==Number(value)||p.method!==body.method||(p.reference||null)!==(body.reference||null))throw new ConflictException('Idempotency key reused for different payment');return p;}
   const balance=await c.query('SELECT COALESCE((SELECT sum(amount_sar*direction) FROM folio_lines WHERE folio_id=$1),0)-COALESCE((SELECT sum(amount_sar) FROM folio_payments WHERE folio_id=$1),0) AS due',[id]);
   if(Number(value)>Number(balance.rows[0].due))throw new ConflictException('Payment exceeds outstanding balance');
   const r=await c.query('INSERT INTO folio_payments(hotel_id,folio_id,amount_sar,method,reference,idempotency_key,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,folio_id,amount_sar,method,reference',[u.hotelId,id,value,body.method,body.reference||null,body.idempotencyKey,u.sub]);
   await c.query('INSERT INTO audit_logs(hotel_id,actor_id,action,entity_id) VALUES($1,$2,$3,$4)',[u.hotelId,u.sub,'PAYMENT_RECORDED',r.rows[0].id]);return r.rows[0];
  });
 }
}
@Module({controllers:[BillingController],providers:[BillingAuth]}) export class BillingModule {}
