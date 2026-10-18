import { BadRequestException, ConflictException, Controller, Get, Injectable, Module, Param, Post, Body, Headers, UnauthorizedException, UseGuards, CanActivate, ExecutionContext, ForbiddenException, Query, ParseUUIDPipe } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';
import { IsDateString, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength, MaxLength } from 'class-validator';

const pool = new Pool({connectionString:process.env.DATABASE_URL, max:3, connectionTimeoutMillis:5000, idleTimeoutMillis:30000, ssl:process.env.PGSSL==='true'?{rejectUnauthorized:true,ca:process.env.PGSSL_CA||undefined}:undefined});
const secret=()=>{if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32)throw new Error('JWT_SECRET must be at least 32 characters');return process.env.JWT_SECRET;};
class LoginDto { @IsEmail() email!:string; @IsString() @IsNotEmpty() password!:string; }
class GuestDto { @IsString() @IsNotEmpty() @MaxLength(160) fullName!:string; @IsOptional() @IsString() @MaxLength(40) phone?:string; @IsOptional() @IsEmail() email?:string; }
class ReservationDto { @IsUUID() guestId!:string; @IsUUID() roomId!:string; @IsDateString() arrivalDate!:string; @IsDateString() departureDate!:string; }
class RoomTypeDto { @IsString() @IsNotEmpty() name!:string; @IsString() @IsNotEmpty() nightlyRate!:string; @IsString() @IsNotEmpty() capacity!:string; }
class RoomDto { @IsString() @IsNotEmpty() number!:string; @IsUUID() roomTypeId!:string; }
class RoomStatusDto { @IsIn(['AVAILABLE','CLEANING','MAINTENANCE','OUT_OF_SERVICE']) status!:string; }
class RateDto { @IsString() nightlyRate!:string; }
class BlockDto { @IsUUID() roomId!:string; @IsDateString() startDate!:string; @IsDateString() endDate!:string; @IsString() @IsNotEmpty() @MaxLength(200) reason!:string; }
class StatusDto { @IsIn(['CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED','NO_SHOW']) status!:string; }

type Claims={sub:string;hotelId:string;role:string};
@Injectable()
class AuthGuard implements CanActivate {
 async canActivate(context:ExecutionContext):Promise<boolean> {
  const req=context.switchToHttp().getRequest();
  const bearer=req.headers.authorization||'';
  if(!bearer.startsWith('Bearer '))throw new UnauthorizedException();
  try {req.user=jwt.verify(bearer.slice(7),secret(),{algorithms:['HS256'],issuer:'pk-hotels-api',audience:'pk-hotels-staff'}) as Claims;const active=await pool.query('SELECT 1 FROM staff WHERE id=$1 AND hotel_id=$2 AND active=true AND role=$3',[req.user.sub,req.user.hotelId,req.user.role]);if(!active.rowCount)throw new UnauthorizedException();return true;}
  catch {throw new UnauthorizedException('Invalid or expired token');}
 }
}
@Injectable()
class Service {
 async query(sql:string,params:any[]=[]){return (await pool.query(sql,params)).rows;}
 async hotel(hotelId:string){const rows=await this.query('SELECT id,name,expected_room_count,currency,timezone FROM hotels WHERE id=$1',[hotelId]);return rows[0];}
 async audit(c:PoolClient,user:Claims,action:string,entity:string){await c.query('INSERT INTO audit_logs(hotel_id,actor_id,action,entity_id) VALUES($1,$2,$3,$4)',[user.hotelId,user.sub,action,entity]);}
 async transaction<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
}
@Controller('auth')
class AuthController {
 constructor(private s:Service){}
 @Post('login') async login(@Body() body:LoginDto){
  secret();
  const rows=await this.s.query('SELECT id,hotel_id,email,password_hash,role FROM staff WHERE lower(email)=lower($1) AND active=true',[body.email]);
  const staff=rows[0];if(!staff||!(await argon2.verify(staff.password_hash,body.password).catch(()=>false)))throw new UnauthorizedException('Invalid credentials');
  return {accessToken:jwt.sign({sub:staff.id,hotelId:staff.hotel_id,role:staff.role},secret(),{expiresIn:'30m',issuer:'pk-hotels-api',audience:'pk-hotels-staff',algorithm:'HS256'}),tokenType:'Bearer',expiresIn:1800};
 }
}
@Controller('operations')
@UseGuards(AuthGuard)
class OperationsController {
 constructor(private s:Service){}
 private authorize(user:Claims,roles:string[]){if(!roles.includes(user.role))throw new ForbiddenException();}
 @Get('hotel') async hotel(@Headers('authorization') token:string){return this.s.hotel(this.claims(token).hotelId);}
 @Get('rooms') async rooms(@Headers('authorization') token:string,@Query('arrival') arrival?:string,@Query('departure') departure?:string){
  const user=this.claims(token);
  if((arrival||departure)&&(!arrival||!departure||!/^\d{4}-\d{2}-\d{2}$/.test(arrival)||!/^\d{4}-\d{2}-\d{2}$/.test(departure)||arrival>=departure))throw new BadRequestException('Valid arrival and departure required');
  return this.s.query(`SELECT r.id,r.number,r.room_type_id,r.status,t.name AS room_type,t.nightly_rate,
   EXISTS(SELECT 1 FROM reservations b WHERE b.room_id=r.id AND b.status='CHECKED_IN') AS occupied,
   (r.status='AVAILABLE' AND NOT EXISTS(SELECT 1 FROM reservations b WHERE b.room_id=r.id AND b.status IN ('CONFIRMED','CHECKED_IN') AND daterange(b.arrival_date,b.departure_date,'[)') && daterange(COALESCE($2::date,(now() AT TIME ZONE 'Asia/Riyadh')::date),COALESCE($3::date,(now() AT TIME ZONE 'Asia/Riyadh')::date+1),'[)')) AND NOT EXISTS(SELECT 1 FROM room_blocks bl WHERE bl.room_id=r.id AND daterange(bl.start_date,bl.end_date,'[)') && daterange(COALESCE($2::date,(now() AT TIME ZONE 'Asia/Riyadh')::date),COALESCE($3::date,(now() AT TIME ZONE 'Asia/Riyadh')::date+1),'[)'))) AS bookable
   FROM rooms r JOIN room_types t ON t.id=r.room_type_id AND t.hotel_id=r.hotel_id WHERE r.hotel_id=$1 ORDER BY r.number`,[user.hotelId,arrival||null,departure||null]);
 }
 @Get('guests') async guests(@Headers('authorization') token:string){return this.s.query('SELECT id,full_name,phone,email FROM guests WHERE hotel_id=$1 ORDER BY created_at DESC LIMIT 500',[this.claims(token).hotelId]);}
 @Get('room-types') async roomTypes(@Headers('authorization') token:string){return this.s.query('SELECT id,name,nightly_rate,capacity FROM room_types WHERE hotel_id=$1 ORDER BY nightly_rate',[this.claims(token).hotelId]);}
 @Post('room-types/:id/rate') async rate(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:RateDto,@Headers('authorization') token:string){
  const u=this.claims(token);this.authorize(u,['ADMIN','MANAGER']);
  if(!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(dto.nightlyRate)||Number(dto.nightlyRate)<=0)throw new BadRequestException('Enter a positive SAR rate');
  return this.s.transaction(async c=>{const r=await c.query('UPDATE room_types SET nightly_rate=$1 WHERE id=$2 AND hotel_id=$3 RETURNING id,name,nightly_rate',[dto.nightlyRate,id,u.hotelId]);if(!r.rowCount)throw new BadRequestException('Room type not found');await this.s.audit(c,u,'RATE_UPDATED',id);return r.rows[0];});
 }
 @Post('rooms/:id/status') async roomStatus(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:RoomStatusDto,@Headers('authorization') token:string){
  const u=this.claims(token);this.authorize(u,['ADMIN','MANAGER','RECEPTIONIST']);
  return this.s.transaction(async c=>{const room=await c.query('SELECT id FROM rooms WHERE id=$1 AND hotel_id=$2 FOR UPDATE',[id,u.hotelId]);if(!room.rowCount)throw new BadRequestException('Room not found');
   const busy=await c.query("SELECT 1 FROM reservations WHERE room_id=$1 AND status='CHECKED_IN'",[id]);if(busy.rowCount)throw new ConflictException('Occupied room status cannot be changed');
   const r=await c.query('UPDATE rooms SET status=$1 WHERE id=$2 RETURNING *',[dto.status,id]);await this.s.audit(c,u,'ROOM_'+dto.status,id);return r.rows[0];});
 }
 @Get('blocks') async blocks(@Headers('authorization') token:string){return this.s.query('SELECT b.*,r.number FROM room_blocks b JOIN rooms r ON r.id=b.room_id WHERE b.hotel_id=$1 ORDER BY b.start_date DESC',[this.claims(token).hotelId]);}
 @Post('blocks') async block(@Body() dto:BlockDto,@Headers('authorization') token:string){
  const u=this.claims(token);this.authorize(u,['ADMIN','MANAGER']);if(!/^\d{4}-\d{2}-\d{2}$/.test(dto.startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(dto.endDate)||dto.startDate>=dto.endDate)throw new BadRequestException('Invalid block dates');
  try{return await this.s.transaction(async c=>{const room=await c.query('SELECT id FROM rooms WHERE id=$1 AND hotel_id=$2 FOR UPDATE',[dto.roomId,u.hotelId]);if(!room.rowCount)throw new BadRequestException('Room not found');
   const busy=await c.query("SELECT 1 FROM reservations WHERE room_id=$1 AND status IN ('CONFIRMED','CHECKED_IN') AND daterange(arrival_date,departure_date,'[)') && daterange($2::date,$3::date,'[)')",[dto.roomId,dto.startDate,dto.endDate]);if(busy.rowCount)throw new ConflictException('Block overlaps an active reservation');
   const r=await c.query('INSERT INTO room_blocks(hotel_id,room_id,start_date,end_date,reason) VALUES($1,$2,$3,$4,$5) RETURNING *',[u.hotelId,dto.roomId,dto.startDate,dto.endDate,dto.reason]);await this.s.audit(c,u,'ROOM_BLOCKED',r.rows[0].id);return r.rows[0];});}catch(e:any){if(e.code==='23P01')throw new ConflictException('Room already blocked');throw e;}
 }
 @Post('room-types') async roomType(@Body() dto:RoomTypeDto,@Headers('authorization') token:string){
  const user=this.claims(token);this.authorize(user,['ADMIN','MANAGER']);
  const capacity=Number(dto.capacity),rate=Number(dto.nightlyRate);
  if(!Number.isInteger(capacity)||capacity<1||!Number.isFinite(rate)||rate<0)throw new BadRequestException('Invalid capacity or rate');
  const result=await this.s.query('INSERT INTO room_types(hotel_id,name,nightly_rate,capacity) VALUES($1,$2,$3,$4) RETURNING *',[user.hotelId,dto.name,rate,capacity]);return result[0];
 }
 @Post('rooms') async addRoom(@Body() dto:RoomDto,@Headers('authorization') token:string){
  const user=this.claims(token);this.authorize(user,['ADMIN','MANAGER']);
  return this.s.transaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[user.hotelId]);
   const count=Number((await c.query('SELECT count(*)::int AS n FROM rooms WHERE hotel_id=$1',[user.hotelId])).rows[0].n);
   const limit=Number((await c.query('SELECT expected_room_count FROM hotels WHERE id=$1',[user.hotelId])).rows[0].expected_room_count);
   if(count>=limit)throw new ConflictException('Configured 40-room capacity reached');
   const roomType=await c.query('SELECT 1 FROM room_types WHERE id=$1 AND hotel_id=$2',[dto.roomTypeId,user.hotelId]);
   if(!roomType.rowCount)throw new BadRequestException('Room type not found in this hotel');
   const r=await c.query('INSERT INTO rooms(hotel_id,room_type_id,number) VALUES($1,$2,$3) RETURNING *',[user.hotelId,dto.roomTypeId,dto.number]);await this.s.audit(c,user,'ROOM_CREATED',r.rows[0].id);return r.rows[0];
  });
 }
 @Post('guests') async guest(@Body() dto:GuestDto,@Headers('authorization') token:string){
  const user=this.claims(token);this.authorize(user,['ADMIN','MANAGER','RECEPTIONIST']);
  return this.s.transaction(async c=>{const r=await c.query('INSERT INTO guests(hotel_id,full_name,phone,email) VALUES($1,$2,$3,$4) RETURNING id,full_name,phone,email',[user.hotelId,dto.fullName,dto.phone||null,dto.email||null]);await this.s.audit(c,user,'GUEST_CREATED',r.rows[0].id);return r.rows[0]});
 }
 @Get('reservations') async reservations(@Headers('authorization') token:string){
  const user=this.claims(token);return this.s.query('SELECT r.id,r.arrival_date,r.departure_date,r.status,r.nightly_rate,(r.departure_date-r.arrival_date) AS nights,((r.departure_date-r.arrival_date)*r.nightly_rate) AS room_subtotal_sar,g.full_name,rm.number FROM reservations r JOIN guests g ON g.id=r.guest_id JOIN rooms rm ON rm.id=r.room_id WHERE r.hotel_id=$1 ORDER BY r.created_at DESC LIMIT 100',[user.hotelId]);
 }
 @Post('reservations') async reserve(@Body() dto:ReservationDto,@Headers('authorization') token:string){
  const user=this.claims(token);this.authorize(user,['ADMIN','MANAGER','RECEPTIONIST']);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dto.arrivalDate)||!/^\d{4}-\d{2}-\d{2}$/.test(dto.departureDate)||dto.arrivalDate>=dto.departureDate)throw new BadRequestException('Invalid stay dates');
  try{return await this.s.transaction(async c=>{
   const r=await c.query(`SELECT rm.id,t.nightly_rate FROM rooms rm JOIN room_types t ON t.id=rm.room_type_id WHERE rm.id=$1 AND rm.hotel_id=$2 AND rm.status='AVAILABLE' FOR UPDATE OF rm`,[dto.roomId,user.hotelId]);
   if(!r.rows[0])throw new ConflictException('Room unavailable');
   if(Number(r.rows[0].nightly_rate)<=0)throw new ConflictException('Room rate must be configured before booking');
   const guest=await c.query('SELECT 1 FROM guests WHERE id=$1 AND hotel_id=$2',[dto.guestId,user.hotelId]);
   if(!guest.rowCount)throw new BadRequestException('Guest not found in this hotel');
   const block=await c.query("SELECT 1 FROM room_blocks WHERE room_id=$1 AND daterange(start_date,end_date,'[)') && daterange($2::date,$3::date,'[)') LIMIT 1",[dto.roomId,dto.arrivalDate,dto.departureDate]);
   if(block.rowCount)throw new ConflictException('Room blocked for selected dates');
   const result=await c.query('INSERT INTO reservations(hotel_id,guest_id,room_id,arrival_date,departure_date,nightly_rate) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[user.hotelId,dto.guestId,dto.roomId,dto.arrivalDate,dto.departureDate,r.rows[0].nightly_rate]);
   await this.s.audit(c,user,'RESERVATION_CREATED',result.rows[0].id);
   const nights=(Date.parse(dto.departureDate+'T00:00:00Z')-Date.parse(dto.arrivalDate+'T00:00:00Z'))/86400000;
   return {...result.rows[0],nights,roomSubtotalSar:(Number(result.rows[0].nightly_rate)*nights).toFixed(2)};
  });}catch(e:any){if(e.code==='23P01'||e.code==='23503')throw new ConflictException('Room already booked or guest invalid');throw e;}
 }
 @Post('reservations/:id/status') async changeStatus(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:StatusDto,@Headers('authorization') token:string){
  const user=this.claims(token);this.authorize(user,['ADMIN','MANAGER','RECEPTIONIST']);
  return this.s.transaction(async c=>{
   const target=await c.query('SELECT room_id FROM reservations WHERE id=$1 AND hotel_id=$2',[id,user.hotelId]);
   if(!target.rowCount)throw new BadRequestException('Reservation not found');
   const room=await c.query('SELECT status FROM rooms WHERE id=$1 AND hotel_id=$2 FOR UPDATE',[target.rows[0].room_id,user.hotelId]);
   const r=await c.query('SELECT * FROM reservations WHERE id=$1 AND hotel_id=$2 FOR UPDATE',[id,user.hotelId]);
   if(!r.rows[0])throw new BadRequestException('Reservation not found');
   const transitions:Record<string,string[]>={CONFIRMED:['CHECKED_IN','CANCELLED','NO_SHOW'],CHECKED_IN:['CHECKED_OUT'],CHECKED_OUT:[],CANCELLED:[],NO_SHOW:[]};
   if(!transitions[r.rows[0].status]?.includes(dto.status))throw new ConflictException('Invalid status transition');
   if(dto.status==='CHECKED_IN'){
    const today=(await c.query("SELECT (now() AT TIME ZONE 'Asia/Riyadh')::date::text AS day")).rows[0].day;
    const dates=await c.query('SELECT arrival_date::text AS arrival,departure_date::text AS departure FROM reservations WHERE id=$1',[id]);
    if(today<dates.rows[0].arrival||today>=dates.rows[0].departure)throw new ConflictException('Check-in is allowed within the booked stay dates');
    if(room.rows[0].status!=='AVAILABLE')throw new ConflictException('Room is not ready for check-in');
    const occupied=await c.query("SELECT 1 FROM reservations WHERE room_id=$1 AND status='CHECKED_IN' AND id<>$2",[target.rows[0].room_id,id]);if(occupied.rowCount)throw new ConflictException('Room is already occupied');
   }
   if(dto.status==='CHECKED_OUT'){
    const f=await c.query('SELECT id,status FROM folios WHERE reservation_id=$1 AND hotel_id=$2 FOR UPDATE',[id,user.hotelId]);
    if(!f.rowCount)throw new ConflictException('Open and settle the guest folio before checkout');
    const totals=await c.query('SELECT COALESCE((SELECT sum(amount_sar*direction) FROM folio_lines WHERE folio_id=$1),0)-COALESCE((SELECT sum(amount_sar) FROM folio_payments WHERE folio_id=$1),0) AS balance',[f.rows[0].id]);
    if(Number(totals.rows[0].balance)!==0)throw new ConflictException('Folio balance must be zero before checkout');
    await c.query("UPDATE folios SET status='CLOSED',closed_at=now() WHERE id=$1",[f.rows[0].id]);
    await c.query("UPDATE rooms SET status='CLEANING' WHERE id=$1",[target.rows[0].room_id]);
   }
   const changed=await c.query('UPDATE reservations SET status=$1 WHERE id=$2 RETURNING *',[dto.status,id]);
   await this.s.audit(c,user,'RESERVATION_'+dto.status,id);return changed.rows[0];
  });
 }
 private claims(token:string):Claims{return jwt.verify(token.slice(7),secret(),{algorithms:['HS256'],issuer:'pk-hotels-api',audience:'pk-hotels-staff'}) as Claims;}
}
@Module({providers:[Service,AuthGuard],controllers:[AuthController,OperationsController]})
export class Phase1Module {}
