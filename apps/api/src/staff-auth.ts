import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Pool } from 'pg';
import * as jwt from 'jsonwebtoken';
export type StaffClaims={sub:string;hotelId:string;role:string;sessionVersion?:number};
export async function authenticateStaff(pool:Pool,authorization:string,allowPasswordChange=false){
 if(!authorization?.startsWith('Bearer '))throw new UnauthorizedException();
 let user:StaffClaims;
 try{user=jwt.verify(authorization.slice(7),process.env.JWT_SECRET!,{algorithms:['HS256'],issuer:'pk-hotels-api',audience:'pk-hotels-staff'}) as StaffClaims;}catch{throw new UnauthorizedException('Invalid or expired token');}
 const result=await pool.query('SELECT id,email,full_name,role,must_change_password FROM staff WHERE id=$1 AND hotel_id=$2 AND active=true AND role=$3 AND session_version=$4',[user.sub,user.hotelId,user.role,user.sessionVersion??0]);
 if(!result.rowCount)throw new UnauthorizedException('Account access has changed. Sign in again.');
 if(result.rows[0].must_change_password&&!allowPasswordChange)throw new ForbiddenException('Change your temporary password before accessing hotel operations');
 return {user,profile:result.rows[0]};
}
