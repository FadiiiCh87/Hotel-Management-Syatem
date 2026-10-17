import { BadRequestException, ConflictException, Controller, Get, Injectable, Module, Param, Post, Body, Headers, UnauthorizedException, UseGuards, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';
import { IsDateString, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

const pool = new Pool({connectionString:process.env.DATABASE_URL, ssl:process.env.PGSSL==='true'?{rejectUnauthorized:true}:undefined});
const secret=()=>{if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32)throw new Error('JWT_SECRET must be at least 32 characters');return process.env.JWT_SECRET;};
class LoginDto { @IsEmail() email!:string; @IsString() @IsNotEmpty() password!:string; }
class GuestDto { @IsString() @IsNotEmpty() fullName!:string; @IsOptional() @IsString() phone?:string; @IsOptional() @IsEmail() email?:string; }
class ReservationDto { @IsUUID() guestId!:string; @IsUUID() roomId!:string; @IsDateString() arrivalDate!:string; @IsDateString() departureDate!:string; }
class RoomTypeDto { @IsString() @IsNotEmpty() name!:string; @IsString() @IsNotEmpty() nightlyRate!:string; @IsString() @IsNotEmpty() capacity!:string; }
class RoomDto { @IsString() @IsNotEmpty() number!:string; @IsUUID() roomTypeId!:string; }
class StatusDto { @IsIn(['CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED','NO_SHOW']) status!:string; }

type Claims={sub:string;hotelId:string;role:string};
@Injectable()
class AuthGuard implements CanActivate {
 canActivate(context:ExecutionContext):boolean {
  const req=context.switchToHttp().getRequest();
  const bearer=req.headers.authorization||'';
  if(!bearer.startsWith('Bearer '))throw new UnauthorizedException();
  try {req.user=jwt.verify(bearer.slice(7),secret(),{algorithms:['HS256'],issuer:'pk-hotels-api',audience:'pk-hotels-staff'}) as Claims;return true;}
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
  const rows=await this.s.query('SELECT id,hotel_id,email,password_hash,role FROM staff WHERE lower(email)=lower($1) AND active=true',[body.email]);
  const staff=rows[0];if(!staff||!(await argon2.verify(staff.password_hash,body.password)))throw new UnauthorizedException('Invalid credentials');
  return {accessToken:jwt.sign({sub:staff.id,hotelId:staff.hotel_id,role:staff.role},secret(),{expiresIn:'30m',issuer:'pk-hotels-api',audience:'pk-hotels-staff',algorithm:'HS256'}),tokenType:'Bearer',expiresIn:1800};
 }
}
@Controller('operations')
@UseGuards(AuthGuard)
class OperationsController {
 constructor(private s:Service){}
 private authorize(user:Claims,roles:string[]){if(!roles.includes(user.role))throw new ForbiddenException();}
 @Get('hotel') async hotel(@Headers('authorization') token:string){return this.s.hotel(this.claims(token).hotelId);}
 @Get('rooms') async rooms(@Headers('authorization') token:string){const user=this.claims(token);return this.s.query('SELECT r.id,r.number,r.status,t.name AS room_type,t.nightly_rate FROM rooms r JOIN room_types t ON t.id=r.room_type_id WHERE r.hotel_id=$1 ORDER BY r.number',[user.hotelId]);}
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
 @Post('reservations/:id/status') async changeStatus(@Param('id') id:string,@Body() dto:StatusDto,@Headers('authorization') token:string){
  const user=this.claims(token);this.authorize(user,['ADMIN','MANAGER','RECEPTIONIST']);
  return this.s.transaction(async c=>{
   const r=await c.query('SELECT * FROM reservations WHERE id=$1 AND hotel_id=$2 FOR UPDATE',[id,user.hotelId]);
   if(!r.rows[0])throw new BadRequestException('Reservation not found');
   const transitions:Record<string,string[]>={CONFIRMED:['CHECKED_IN','CANCELLED','NO_SHOW'],CHECKED_IN:['CHECKED_OUT'],CHECKED_OUT:[],CANCELLED:[],NO_SHOW:[]};
   if(!transitions[r.rows[0].status]?.includes(dto.status))throw new ConflictException('Invalid status transition');
   const changed=await c.query('UPDATE reservations SET status=$1 WHERE id=$2 RETURNING *',[dto.status,id]);
   await this.s.audit(c,user,'RESERVATION_'+dto.status,id);return changed.rows[0];
  });
 }
 private claims(token:string):Claims{return jwt.verify(token.slice(7),secret(),{algorithms:['HS256'],issuer:'pk-hotels-api',audience:'pk-hotels-staff'}) as Claims;}
}
@Module({providers:[Service,AuthGuard],controllers:[AuthController,OperationsController]})
export class Phase1Module {}
