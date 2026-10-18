import { BadRequestException, Body, CanActivate, ConflictException, Controller, ExecutionContext, Get, Injectable, Module, Param, ParseUUIDPipe, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNotEmpty, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { Pool, PoolClient } from 'pg';
import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';
import { authenticateStaff, StaffClaims } from './staff-auth';
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,ssl:process.env.PGSSL==='true'?{rejectUnauthorized:true,ca:process.env.PGSSL_CA||undefined}:undefined});
const secret=()=>{if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32)throw new Error('JWT_SECRET must be at least 32 characters');return process.env.JWT_SECRET;};
async function tx<T>(fn:(c:PoolClient)=>Promise<T>){const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function audit(c:PoolClient,u:StaffClaims,action:string,id:string){await c.query('INSERT INTO audit_logs(hotel_id,actor_id,action,entity_id) VALUES($1,$2,$3,$4)',[u.hotelId,u.sub,action,id]);}
class LoginDto { @IsEmail() @MaxLength(254) email!:string; @IsString() @IsNotEmpty() @MaxLength(128) password!:string; }
class RegisterDto extends LoginDto { @IsString() @MinLength(2) @MaxLength(160) fullName!:string; @IsString() @MinLength(5) @MaxLength(40) phone!:string; }
class RequestDto { @IsUUID() roomTypeId!:string; @IsDateString() arrivalDate!:string; @IsDateString() departureDate!:string; }
class ReferenceDto { @IsString() @MinLength(3) @MaxLength(100) reference!:string; }
class RejectDto { @IsString() @MinLength(3) @MaxLength(500) reason!:string; }
class ReadDto { @IsUUID() requestId!:string; @IsInt() @Min(1) version!:number; }
class VerifyDto extends ReferenceDto { @IsUUID() roomId!:string; @IsString() amountSar!:string; @IsIn(['CASH','BANK_TRANSFER','CARD_EXTERNAL']) method!:string; @IsBoolean() paymentReceived!:boolean; }
function stay(arrival:string,departure:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(arrival)||!/^\d{4}-\d{2}-\d{2}$/.test(departure))throw new BadRequestException('Use valid arrival and departure dates');
 const a=Date.parse(arrival+'T00:00:00Z'),b=Date.parse(departure+'T00:00:00Z');
 if(!Number.isFinite(a)||!Number.isFinite(b)||new Date(a).toISOString().slice(0,10)!==arrival||new Date(b).toISOString().slice(0,10)!==departure)throw new BadRequestException('Invalid stay dates');
 const nights=(b-a)/86400000,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if(arrival<today||nights<1||nights>90)throw new BadRequestException('Arrival must be today or later, with a stay of 1–90 nights');return nights;
}
const requestSelect=`SELECT q.id,q.room_type_id,t.name AS room_type,q.arrival_date::text,q.departure_date::text,q.nightly_rate,q.advance_required_sar,q.status,q.customer_payment_reference,q.decision_note,q.reservation_id,q.notification_version,q.created_at,q.updated_at,rm.number AS room_number,r.status AS reservation_status FROM booking_requests q JOIN room_types t ON t.id=q.room_type_id AND t.hotel_id=q.hotel_id LEFT JOIN reservations r ON r.id=q.reservation_id AND r.hotel_id=q.hotel_id LEFT JOIN rooms rm ON rm.id=r.room_id AND rm.hotel_id=q.hotel_id`;
@Injectable() class CustomerAuth implements CanActivate {
 async canActivate(ctx:ExecutionContext){const req=ctx.switchToHttp().getRequest(),auth=String(req.headers.authorization||'');let claims:any;
  try{if(!auth.startsWith('Bearer '))throw new Error();claims=jwt.verify(auth.slice(7),secret(),{algorithms:['HS256'],issuer:'pk-hotels-api',audience:'pk-hotels-customers'});}catch{throw new UnauthorizedException('Please sign in to your guest account');}
  const r=await pool.query('SELECT id,hotel_id,full_name,email,phone FROM customer_accounts WHERE id=$1 AND hotel_id=$2 AND active=true AND session_version=$3',[claims.sub,claims.hotelId,claims.sessionVersion]);
  if(!r.rowCount)throw new UnauthorizedException();req.customer=r.rows[0];return true;
 }
}
@Injectable() class ReceptionAuth implements CanActivate {
 async canActivate(ctx:ExecutionContext){const req=ctx.switchToHttp().getRequest();req.staff=(await authenticateStaff(pool,req.headers.authorization||'')).user;return true;}
}
@Controller('guest') class GuestController {
 @Post('register') async register(@Body() b:RegisterDto){
  if(b.password.length<12||!b.fullName.trim()||b.phone.trim().length<5)throw new BadRequestException('Enter a name, phone and password of at least 12 characters');
  const hotel=(await pool.query("SELECT id FROM hotels WHERE name='PK-Hotels' LIMIT 1")).rows[0];if(!hotel)throw new BadRequestException('Hotel unavailable');
  const hash=await argon2.hash(b.password);try{await pool.query('INSERT INTO customer_accounts(hotel_id,full_name,email,phone,password_hash) VALUES($1,$2,$3,$4,$5)',[hotel.id,b.fullName.trim(),b.email.trim().toLowerCase(),b.phone.trim(),hash]);}catch(e:any){if(e.code==='23505')throw new ConflictException('Unable to register this email. Sign in if you already have an account.');throw e;}return {signInRequired:true};
 }
 @Post('login') async login(@Body() b:LoginDto){
  const r=await pool.query("SELECT c.id,c.hotel_id,c.password_hash,c.session_version FROM customer_accounts c JOIN hotels h ON h.id=c.hotel_id WHERE lower(c.email)=lower($1) AND c.active=true AND h.name='PK-Hotels'",[b.email]);const c=r.rows[0];
  if(!c||!await argon2.verify(c.password_hash,b.password).catch(()=>false))throw new UnauthorizedException('Invalid email or password');
  return {accessToken:jwt.sign({sub:c.id,hotelId:c.hotel_id,sessionVersion:c.session_version},secret(),{expiresIn:'30m',issuer:'pk-hotels-api',audience:'pk-hotels-customers',algorithm:'HS256'}),expiresIn:1800};
 }
 @Get('me') @UseGuards(CustomerAuth) me(@Req() req:any){return req.customer;}
 @Get('catalog') @UseGuards(CustomerAuth) async catalog(@Req() req:any){const u=req.customer;const r=await pool.query('SELECT id,name,nightly_rate,capacity FROM room_types WHERE hotel_id=$1 AND nightly_rate>0 ORDER BY nightly_rate',[u.hotel_id]);return {roomTypes:r.rows,currency:'SAR',advancePercent:100,taxStatus:'UNCONFIRMED',onlinePaymentsEnabled:false,paymentInstructions:'After reception approves your request, contact the hotel reception to arrange full advance payment. Submit your payment or receipt reference here. Reception must verify actual receipt before allocating a room.'};}
 @Get('requests') @UseGuards(CustomerAuth) async requests(@Req() req:any){return (await pool.query(requestSelect+' WHERE q.hotel_id=$1 AND q.customer_id=$2 ORDER BY q.created_at DESC LIMIT 100',[req.customer.hotel_id,req.customer.id])).rows;}
 @Post('requests') @UseGuards(CustomerAuth) async create(@Req() req:any,@Body() b:RequestDto){const nights=stay(b.arrivalDate,b.departureDate),u=req.customer;
  return tx(async c=>{
   await c.query('SELECT id FROM customer_accounts WHERE id=$1 AND hotel_id=$2 FOR UPDATE',[u.id,u.hotel_id]);
   const n=await c.query("SELECT count(*)::int AS n FROM booking_requests WHERE hotel_id=$1 AND customer_id=$2 AND status IN ('PENDING_REVIEW','AWAITING_PAYMENT','PAYMENT_REVIEW')",[u.hotel_id,u.id]);if(n.rows[0].n>=5)throw new ConflictException('You already have five open requests. Contact reception.');
   const type=await c.query('SELECT nightly_rate FROM room_types WHERE id=$1 AND hotel_id=$2 AND nightly_rate>0',[b.roomTypeId,u.hotel_id]);if(!type.rowCount)throw new BadRequestException('Room category unavailable');
   const r=await c.query('INSERT INTO booking_requests(hotel_id,customer_id,room_type_id,arrival_date,departure_date,nightly_rate,advance_required_sar) VALUES($1,$2,$3,$4,$5,$6,$6::numeric*$7) RETURNING id,status,advance_required_sar',[u.hotel_id,u.id,b.roomTypeId,b.arrivalDate,b.departureDate,type.rows[0].nightly_rate,nights]);return r.rows[0];
  });
 }
 @Post('requests/:id/payment-reference') @UseGuards(CustomerAuth) async reference(@Req() req:any,@Param('id',new ParseUUIDPipe()) id:string,@Body() b:ReferenceDto){if(b.reference.trim().length<3)throw new BadRequestException('Payment reference required');const u=req.customer;
  const r=await pool.query("UPDATE booking_requests SET customer_payment_reference=$1,status='PAYMENT_REVIEW',notification_version=notification_version+1,updated_at=now() WHERE id=$2 AND hotel_id=$3 AND customer_id=$4 AND status='AWAITING_PAYMENT' RETURNING id,status",[b.reference.trim(),id,u.hotel_id,u.id]);if(!r.rowCount)throw new ConflictException('An approved request awaiting payment is required');return r.rows[0];
 }
 @Post('requests/:id/cancel') @UseGuards(CustomerAuth) async cancel(@Req() req:any,@Param('id',new ParseUUIDPipe()) id:string){const u=req.customer;const r=await pool.query("UPDATE booking_requests SET status='CANCELLED',notification_version=notification_version+1,updated_at=now() WHERE id=$1 AND hotel_id=$2 AND customer_id=$3 AND status IN ('PENDING_REVIEW','AWAITING_PAYMENT') RETURNING id,status",[id,u.hotel_id,u.id]);if(!r.rowCount)throw new ConflictException('Only an unpaid pending request can be cancelled here. Contact reception for other requests.');return r.rows[0];}
}
@Controller('booking-requests') @UseGuards(ReceptionAuth) class ReceptionRequestsController {
 @Get() async list(@Req() req:any){const u=req.staff;return (await pool.query(`SELECT q.*,c.full_name,c.email,c.phone,t.name AS room_type,rm.number AS room_number,COALESCE(rd.seen_version,0)<q.notification_version AS unread FROM booking_requests q JOIN customer_accounts c ON c.id=q.customer_id AND c.hotel_id=q.hotel_id JOIN room_types t ON t.id=q.room_type_id AND t.hotel_id=q.hotel_id LEFT JOIN reservations r ON r.id=q.reservation_id AND r.hotel_id=q.hotel_id LEFT JOIN rooms rm ON rm.id=r.room_id AND rm.hotel_id=q.hotel_id LEFT JOIN booking_request_reads rd ON rd.request_id=q.id AND rd.staff_id=$2 AND rd.hotel_id=q.hotel_id WHERE q.hotel_id=$1 ORDER BY q.updated_at DESC LIMIT 200`,[u.hotelId,u.sub])).rows;}
 @Post('read') async read(@Req() req:any,@Body() b:ReadDto){const u=req.staff;const r=await pool.query('INSERT INTO booking_request_reads(hotel_id,staff_id,request_id,seen_version) SELECT hotel_id,$1,id,LEAST(notification_version,$2) FROM booking_requests WHERE id=$3 AND hotel_id=$4 ON CONFLICT(staff_id,request_id) DO UPDATE SET seen_version=GREATEST(booking_request_reads.seen_version,EXCLUDED.seen_version) RETURNING request_id',[u.sub,b.version,b.requestId,u.hotelId]);if(!r.rowCount)throw new BadRequestException('Request not found');return {read:true};}
 @Post(':id/approve') async approve(@Req() req:any,@Param('id',new ParseUUIDPipe()) id:string){const u=req.staff;return tx(async c=>{const r=await c.query("UPDATE booking_requests SET status='AWAITING_PAYMENT',reviewed_by=$1,updated_at=now() WHERE id=$2 AND hotel_id=$3 AND status='PENDING_REVIEW' RETURNING id,status",[u.sub,id,u.hotelId]);if(!r.rowCount)throw new ConflictException('Pending request required');await audit(c,u,'BOOKING_REQUEST_APPROVED',id);return r.rows[0];});}
 @Post(':id/reject') async reject(@Req() req:any,@Param('id',new ParseUUIDPipe()) id:string,@Body() b:RejectDto){const u=req.staff;if(b.reason.trim().length<3)throw new BadRequestException('Rejection reason required');return tx(async c=>{const r=await c.query("UPDATE booking_requests SET status='REJECTED',decision_note=$1,reviewed_by=$2,updated_at=now() WHERE id=$3 AND hotel_id=$4 AND status IN ('PENDING_REVIEW','AWAITING_PAYMENT','PAYMENT_REVIEW') RETURNING id,status",[b.reason.trim(),u.sub,id,u.hotelId]);if(!r.rowCount)throw new ConflictException('Open request required');await audit(c,u,'BOOKING_REQUEST_REJECTED',id);return r.rows[0];});}
 @Post(':id/verify-and-allocate') async allocate(@Req() req:any,@Param('id',new ParseUUIDPipe()) id:string,@Body() b:VerifyDto){const u=req.staff;
  if(!b.paymentReceived||!/^([1-9]\d{0,9}|0)(\.\d{1,2})?$/.test(b.amountSar)||b.reference.trim().length<3)throw new BadRequestException('Confirm actual receipt of the full advance and enter its reference');
  const reference=b.reference.trim().toUpperCase();
  try{return await tx(async c=>{
   const result=await c.query('SELECT * FROM booking_requests WHERE id=$1 AND hotel_id=$2 FOR UPDATE',[id,u.hotelId]);const q=result.rows[0];if(!q)throw new BadRequestException('Request not found');
   if(q.status==='CONFIRMED'){if(Number(q.verified_advance_sar)!==Number(b.amountSar)||q.verified_payment_reference!==reference||q.verified_payment_method!==b.method)throw new ConflictException('Request already confirmed with different payment details');return {id,status:q.status,reservationId:q.reservation_id};}
   if(!['AWAITING_PAYMENT','PAYMENT_REVIEW'].includes(q.status))throw new ConflictException('Reception approval is required before payment verification');
   if(Number(b.amountSar)!==Number(q.advance_required_sar))throw new ConflictException('The full quoted advance is required. Partial or excess payment cannot allocate a room.');
   const dates=await c.query('SELECT arrival_date::text AS arrival,departure_date::text AS departure FROM booking_requests WHERE id=$1',[id]);const nights=stay(dates.rows[0].arrival,dates.rows[0].departure);
   const room=await c.query("SELECT id FROM rooms WHERE id=$1 AND hotel_id=$2 AND room_type_id=$3 AND status='AVAILABLE' FOR UPDATE",[b.roomId,u.hotelId,q.room_type_id]);if(!room.rowCount)throw new ConflictException('Select a ready room in the requested category');
   const overlap=await c.query("SELECT 1 FROM reservations WHERE room_id=$1 AND status IN ('CONFIRMED','CHECKED_IN') AND daterange(arrival_date,departure_date,'[)') && daterange($2::date,$3::date,'[)') UNION ALL SELECT 1 FROM room_blocks WHERE room_id=$1 AND daterange(start_date,end_date,'[)') && daterange($2::date,$3::date,'[)')",[b.roomId,dates.rows[0].arrival,dates.rows[0].departure]);if(overlap.rowCount)throw new ConflictException('Room is no longer available. Select another room; no payment has been recorded by this action.');
   const customer=(await c.query('SELECT full_name,email,phone FROM customer_accounts WHERE id=$1 AND hotel_id=$2',[q.customer_id,u.hotelId])).rows[0];
   const guest=(await c.query('INSERT INTO guests(hotel_id,full_name,email,phone) VALUES($1,$2,$3,$4) RETURNING id',[u.hotelId,customer.full_name,customer.email,customer.phone])).rows[0];
   const reservation=(await c.query('INSERT INTO reservations(hotel_id,guest_id,room_id,arrival_date,departure_date,nightly_rate) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[u.hotelId,guest.id,b.roomId,dates.rows[0].arrival,dates.rows[0].departure,q.nightly_rate])).rows[0];
   const folio=(await c.query('INSERT INTO folios(hotel_id,reservation_id) VALUES($1,$2) RETURNING id',[u.hotelId,reservation.id])).rows[0];
   await c.query("INSERT INTO folio_lines(hotel_id,folio_id,line_type,description,quantity,unit_price_sar,direction,created_by) VALUES($1,$2,'ROOM','Room nights',$3,$4,1,$5)",[u.hotelId,folio.id,nights,q.nightly_rate,u.sub]);
   await c.query('INSERT INTO folio_payments(hotel_id,folio_id,amount_sar,method,reference,idempotency_key,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[u.hotelId,folio.id,b.amountSar,b.method,reference,id,u.sub]);
   await c.query("UPDATE booking_requests SET status='CONFIRMED',reservation_id=$1,verified_advance_sar=$2,verified_payment_method=$3,verified_payment_reference=$4,verified_by=$5,updated_at=now() WHERE id=$6 AND hotel_id=$7",[reservation.id,b.amountSar,b.method,reference,u.sub,id,u.hotelId]);
   await audit(c,u,'BOOKING_ADVANCE_VERIFIED_AND_ROOM_ALLOCATED',id);await audit(c,u,'RESERVATION_CREATED',reservation.id);await audit(c,u,'PAYMENT_RECORDED',folio.id);
   return {id,status:'CONFIRMED',reservationId:reservation.id,folioId:folio.id};
  });}catch(e:any){if(e.code==='23P01')throw new ConflictException('Room was booked by another reservation. Select another room.');if(e.code==='23505')throw new ConflictException('Payment reference has already been recorded. Check the existing booking.');throw e;}
 }
}
@Module({controllers:[GuestController,ReceptionRequestsController],providers:[CustomerAuth,ReceptionAuth]}) export class GuestBookingModule {}
