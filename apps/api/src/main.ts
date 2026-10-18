import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Catch, ExceptionFilter, ArgumentsHost, HttpException } from '@nestjs/common';
import { AppModule } from './module';
@Catch() class SafeErrors implements ExceptionFilter {
 catch(error:any,host:ArgumentsHost){const res=host.switchToHttp().getResponse();
  if(error instanceof HttpException){res.status(error.getStatus()).json(error.getResponse());return;}
  if(['22P02','22007','22008'].includes(error?.code)){res.status(400).json({message:'Invalid value or date'});return;}
  const databaseError=error?.code?.startsWith('08')||['ECONNREFUSED','ENETUNREACH','ENOTFOUND','ETIMEDOUT','28P01','3D000'].includes(error?.code)||error?.name==='AggregateError'||/connection|timeout/i.test(error?.message||'');
  console.error('Request failed',error?.code||error?.name||'unknown');
  res.status(databaseError?503:500).json({statusCode:databaseError?503:500,message:databaseError?'Database connection unavailable':'Request could not be completed'});
 }
}
async function bootstrap(){
 const app=await NestFactory.create(AppModule);
 app.setGlobalPrefix('api/v1');
 app.useGlobalFilters(new SafeErrors());
 const attempts=new Map<string,{count:number;until:number}>();
 app.use((req:any,res:any,next:()=>void)=>{if(req.method==='POST'&&['/api/v1/auth/login','/api/v1/guest/login','/api/v1/guest/register','/api/v1/public/contact'].includes(req.path)){
  const now=Date.now(),key=(req.ip||'unknown')+':'+req.path;for(const [ip,v] of attempts)if(v.until<now)attempts.delete(ip);
  const value=attempts.get(key)||{count:0,until:now+60000};value.count++;attempts.set(key,value);
  if(value.count>10){res.status(429).json({message:'Too many attempts. Try again in one minute.'});return;}
 }res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');next();});
 app.enableCors({origin:process.env.WEB_ORIGIN||'http://localhost:3000'});
 app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
 await app.listen(Number(process.env.PORT||4000),'0.0.0.0');
}
bootstrap();
