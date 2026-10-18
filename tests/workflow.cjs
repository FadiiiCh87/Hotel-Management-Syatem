// Real SQL and HTTP workflow against an isolated, in-memory PostgreSQL engine.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {btree_gist}=require('@electric-sql/pglite/contrib/btree_gist');
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const argon2=require('argon2');
(async()=>{
 const db=new PGlite({extensions:{btree_gist,pgcrypto}});
 await db.waitReady;
 for(const f of ['phase1.sql','phase2-billing.sql','phase2-tax-safety.sql','seed-pk-hotels-rooms.sql'])await db.exec(fs.readFileSync('apps/api/prisma/'+f,'utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261018195112_staff_management.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261018202417_guest_booking_requests.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261018213839_hotel_contact_enquiries.sql','utf8'));
 const hotel=(await db.query('SELECT id FROM hotels')).rows[0].id;
 const hash=await argon2.hash('Test-Only-Password-123');
 await db.query("INSERT INTO staff(hotel_id,email,password_hash,role) VALUES($1,'test@example.com',$2,'ADMIN')",[hotel,hash]);
 class Pool {async query(sql,params){const r=await db.query(sql,params);return {rows:r.rows,rowCount:r.rows.length||r.affectedRows||0};}async connect(){return {query:this.query.bind(this),release(){}};}}
 require('pg').Pool=Pool;
 process.env.JWT_SECRET='test-only-random-secret-for-isolated-workflow-tests';
 const {NestFactory}=require('@nestjs/core');const {ValidationPipe}=require('@nestjs/common');const {AppModule}=require('../apps/api/dist/module');
 const app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api/v1');app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.listen(4200,'127.0.0.1');
 let token;let count=0;
 async function request(path,body,status=200){const r=await fetch('http://127.0.0.1:4200/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();assert.equal(r.status,status,JSON.stringify({path,data}));count++;return data;}
 try{
 await request('/operations/rooms',undefined,401);
 await request('/auth/login',{email:'test@example.com',password:'wrong'},401);
 token=(await request('/auth/login',{email:'test@example.com',password:'Test-Only-Password-123'},201)).accessToken;
 const rooms=await request('/operations/rooms');assert.equal(rooms.length,40);
 const guest=await request('/operations/guests',{fullName:'Isolated test guest'},201);
 const day=(await db.query("select (now() at time zone 'Asia/Riyadh')::date::text as day")).rows[0].day;
 const end=new Date(day+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+1);const departure=end.toISOString().slice(0,10);
 const reservation=await request('/operations/reservations',{guestId:guest.id,roomId:rooms[0].id,arrivalDate:day,departureDate:departure},201);
 await request('/operations/reservations',{guestId:guest.id,roomId:rooms[0].id,arrivalDate:day,departureDate:departure},409);
 const availability=await request('/operations/rooms?arrival='+day+'&departure='+departure);assert.equal(availability.find(r=>r.id===rooms[0].id).bookable,false);
 await request('/operations/blocks',{roomId:rooms[0].id,startDate:day,endDate:departure,reason:'Overlapping test'},409);
 await request('/operations/reservations/'+reservation.id+'/status',{status:'CHECKED_IN'},201);
 await request('/operations/rooms/'+rooms[0].id+'/status',{status:'MAINTENANCE'},409);
 await request('/operations/reservations/'+reservation.id+'/status',{status:'CHECKED_OUT'},409);
 const opened=await request('/billing/reservations/'+reservation.id+'/folio',{},201);
 let folio=await request('/billing/folios/'+opened.folioId);assert.equal(Number(folio.balanceBeforeTaxSar),Number(rooms[0].nightly_rate));
 await request('/billing/folios/'+opened.folioId+'/lines',{type:'SERVICE',description:'Test service',quantity:'1',unitPriceSar:'10.00'},201);
 await request('/billing/folios/'+opened.folioId+'/lines',{type:'DISCOUNT',description:'Test discount',quantity:'1',unitPriceSar:'5.00'},201);
 await request('/operations/reservations/'+reservation.id+'/status',{status:'CHECKED_OUT'},409);
 folio=await request('/billing/folios/'+opened.folioId);const {randomUUID}=require('node:crypto');
 await request('/billing/folios/'+opened.folioId+'/payments',{amountSar:String(Number(folio.balanceBeforeTaxSar)+1),method:'CASH',idempotencyKey:randomUUID()},409);
 const payment={amountSar:folio.balanceBeforeTaxSar,method:'CASH',idempotencyKey:randomUUID()};
 await request('/billing/folios/'+opened.folioId+'/payments',payment,201);
 await request('/billing/folios/'+opened.folioId+'/payments',payment,201);
 folio=await request('/billing/folios/'+opened.folioId);assert.equal(folio.payments.length,1);assert.equal(folio.balanceBeforeTaxSar,'0.00');
 const preview=await request('/tax-and-invoices/folios/'+opened.folioId+'/statement-preview');assert.equal(preview.officialInvoice,false);assert.equal(preview.vatAmountSar,null);assert.equal(preview.taxStatus,'UNCONFIRMED');
 await request('/operations/reservations/'+reservation.id+'/status',{status:'CHECKED_OUT'},201);
 const after=await request('/operations/rooms');assert.equal(after.find(r=>r.id===rooms[0].id).status,'CLEANING');
 await request('/billing/folios/'+opened.folioId+'/payments',{...payment,idempotencyKey:randomUUID()},409);
 await request('/operations/rooms/'+rooms[0].id+'/status',{status:'AVAILABLE'},201);
 await request('/operations/reservations/'+reservation.id+'/status',{status:'CHECKED_IN'},409);
 await request('/operations/blocks',{roomId:rooms[1].id,startDate:day,endDate:departure,reason:'Maintenance test'},201);
 await request('/operations/reservations',{guestId:guest.id,roomId:rooms[1].id,arrivalDate:day,departureDate:departure},409);
 const types=await request('/operations/room-types');await request('/operations/room-types/'+types[0].id+'/rate',{nightlyRate:'90.00'},201);
 assert.equal(Number((await db.query('SELECT nightly_rate FROM reservations WHERE id=$1',[reservation.id])).rows[0].nightly_rate),Number(rooms[0].nightly_rate));
 await request('/billing/reservations/'+reservation.id+'/folio');
 await request('/operations/rooms?arrival='+departure+'&departure='+day,undefined,400);
 await request('/operations/guests',{fullName:'Test',unexpected:'value'},400);

 const adminToken=token;
 const adminMe=await request('/auth/me');assert.equal(adminMe.role,'ADMIN');assert.equal(adminMe.password_hash,undefined);
 await request('/staff/'+adminMe.id+'/access',{fullName:'Test admin',role:'RECEPTIONIST',active:true},409);
 await request('/staff/'+adminMe.id+'/access',{fullName:'Test admin',role:'ADMIN',active:false},409);
 const staff=await request('/staff',{fullName:'Test receptionist',email:'Reception@Example.com',role:'RECEPTIONIST',temporaryPassword:'Temporary-Password-123'},201);
 assert.equal(staff.email,'reception@example.com');assert.equal(staff.password_hash,undefined);
 await request('/staff',{fullName:'Duplicate',email:'RECEPTION@example.com',role:'RECEPTIONIST',temporaryPassword:'Temporary-Password-123'},409);
 await request('/staff',{fullName:'Weak',email:'weak@example.com',role:'RECEPTIONIST',temporaryPassword:'short'},400);
 token=(await request('/auth/login',{email:staff.email,password:'Temporary-Password-123'},201)).accessToken;
 assert.equal((await request('/auth/me')).must_change_password,true);
 await request('/operations/rooms',undefined,403);await request('/billing/folios/'+opened.folioId,undefined,403);await request('/tax-and-invoices/status',undefined,403);await request('/staff',undefined,403);
 await request('/auth/password',{currentPassword:'wrong',newPassword:'Personal-Password-123'},401);
 await request('/auth/password',{currentPassword:'Temporary-Password-123',newPassword:'Personal-Password-123'},201);
 await request('/auth/me',undefined,401);
 await request('/auth/login',{email:staff.email,password:'Temporary-Password-123'},401);
 token=(await request('/auth/login',{email:staff.email,password:'Personal-Password-123'},201)).accessToken;
 await request('/staff',undefined,403);await request('/staff',{fullName:'Denied',email:'denied@example.com',role:'ADMIN',temporaryPassword:'Denied-Password-123'},403);
 await request('/operations/room-types/'+types[0].id+'/rate',{nightlyRate:'999'},403);
 await request('/billing/folios/'+opened.folioId+'/lines',{type:'ADJUSTMENT',description:'Denied',quantity:'1',unitPriceSar:'1'},403);
 // Receptionist can register and book a walk-in guest using their own account.
 const walkin=await request('/operations/guests',{fullName:'Walk-in reception test'},201);
 const walkinStay=await request('/operations/reservations',{guestId:walkin.id,roomId:rooms[3].id,arrivalDate:day,departureDate:departure},201);
 await request('/operations/reservations/'+walkinStay.id+'/status',{status:'CHECKED_IN'},201);
 const receptionistToken=token;token=adminToken;
 const list=await request('/staff');assert.equal(list.length,2);assert(list.every(x=>!('password_hash' in x)));
 await request('/staff/'+staff.id+'/access',{fullName:'Reception updated',role:'MANAGER',active:true},201);
 token=receptionistToken;await request('/operations/rooms',undefined,401);
 token=(await request('/auth/login',{email:staff.email,password:'Personal-Password-123'},201)).accessToken;
 await request('/operations/room-types/'+types[0].id+'/rate',{nightlyRate:'95'},201);await request('/staff',undefined,403);
 const managerToken=token;token=adminToken;
 await request('/staff/'+staff.id+'/reset-password',{temporaryPassword:'Reset-Password-123'},201);
 token=managerToken;await request('/billing/folios/'+opened.folioId,undefined,401);await request('/tax-and-invoices/status',undefined,401);
 token=(await request('/auth/login',{email:staff.email,password:'Reset-Password-123'},201)).accessToken;
 assert.equal((await request('/auth/me')).must_change_password,true);await request('/operations/rooms',undefined,403);
 token=adminToken;await request('/staff/'+staff.id+'/access',{fullName:'Reception updated',role:'RECEPTIONIST',active:false},201);
 await request('/auth/login',{email:staff.email,password:'Reset-Password-123'},401);
 // Another hotel's staff cannot be read or changed through this hotel's admin.
 const otherHotel=(await db.query("INSERT INTO hotels(name,expected_room_count) VALUES('Other hotel',1) RETURNING id")).rows[0].id;
 const outsider=(await db.query("INSERT INTO staff(hotel_id,email,password_hash,role) VALUES($1,'outside@example.com',$2,'ADMIN') RETURNING id",[otherHotel,hash])).rows[0].id;
 await request('/staff/'+outsider+'/access',{fullName:'Denied',role:'RECEPTIONIST',active:false},400);
 await request('/staff/'+outsider+'/reset-password',{temporaryPassword:'Denied-Password-123'},400);
 assert(!(await request('/staff')).some(x=>x.id===outsider));

 // Customer and staff tokens use separate audiences. Requests never hold inventory.
 token='';await request('/guest/requests',undefined,401);
 await request('/guest/register',{fullName:'Guest one',phone:'0500000001',email:'customer1@example.com',password:'short'},400);
 const customer1={fullName:'Guest one',phone:'0500000001',email:'customer1@example.com',password:'Customer-Password-123'};
 await request('/guest/register',customer1,201);await request('/guest/register',{...customer1,email:'CUSTOMER1@example.com'},409);
 await request('/guest/login',{email:customer1.email,password:'wrong'},401);
 token=(await request('/guest/login',{email:customer1.email,password:customer1.password},201)).accessToken;const customerToken=token;
 const profile=await request('/guest/me');assert.equal(profile.password_hash,undefined);
 const catalog=await request('/guest/catalog');assert.equal(catalog.advancePercent,100);assert.equal(catalog.onlinePaymentsEnabled,false);
 await request('/operations/rooms',undefined,401);await request('/booking-requests',undefined,401);await request('/billing/folios/'+opened.folioId,undefined,401);await request('/staff',undefined,401);
 const requestBody={roomTypeId:rooms[4].room_type_id,arrivalDate:day,departureDate:departure};
 await request('/guest/requests',{...requestBody,arrivalDate:'2020-01-01'},400);
 await request('/guest/requests',{...requestBody,departureDate:day},400);
 await request('/guest/requests',{...requestBody,nightlyRate:'0.01'},400);
 const bookingsBefore=(await db.query('SELECT count(*)::int AS n FROM reservations')).rows[0].n;
 const online=await request('/guest/requests',requestBody,201);assert.equal(online.status,'PENDING_REVIEW');
 const quote=online.advance_required_sar;assert.equal(Number(quote),Number(rooms[4].nightly_rate));
 assert.equal((await db.query('SELECT count(*)::int AS n FROM reservations')).rows[0].n,bookingsBefore);
 await request('/guest/requests/'+online.id+'/payment-reference',{reference:'not-approved'},409);
 // A different customer cannot see, cancel, or submit a reference on this request.
 token='';await request('/guest/register',{...customer1,email:'customer2@example.com'},201);
 token=(await request('/guest/login',{email:'customer2@example.com',password:customer1.password},201)).accessToken;
 assert.equal((await request('/guest/requests')).length,0);
 await request('/guest/requests/'+online.id+'/cancel',{},409);
 await request('/guest/requests/'+online.id+'/payment-reference',{reference:'other-user'},409);
 token=adminToken;await request('/guest/requests',undefined,401);
 let queue=await request('/booking-requests');assert(queue.find(q=>q.id===online.id).unread);
 await request('/booking-requests/read',{requestId:online.id,version:1},201);
 queue=await request('/booking-requests');assert.equal(queue.find(q=>q.id===online.id).unread,false);
 const verify={roomId:rooms[4].id,amountSar:quote,method:'BANK_TRANSFER',reference:'TEST-ADVANCE-ONE',paymentReceived:true};
 await request('/booking-requests/'+online.id+'/verify-and-allocate',verify,409);
 await request('/booking-requests/'+online.id+'/approve',{},201);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM reservations')).rows[0].n,bookingsBefore);
 token=customerToken;await request('/guest/requests/'+online.id+'/payment-reference',{reference:'TEST-ADVANCE-ONE'},201);
 assert.equal((await request('/guest/requests'))[0].room_number,null);
 await request('/guest/requests/'+online.id+'/cancel',{},409);
 token=adminToken;queue=await request('/booking-requests');assert.equal(queue.find(q=>q.id===online.id).unread,true);
 await request('/booking-requests/'+online.id+'/verify-and-allocate',{...verify,paymentReceived:false},400);
 await request('/booking-requests/'+online.id+'/verify-and-allocate',{...verify,amountSar:String(Number(quote)-1)},409);
 await request('/booking-requests/'+online.id+'/verify-and-allocate',{...verify,amountSar:String(Number(quote)+1)},409);
 await request('/booking-requests/'+online.id+'/verify-and-allocate',{...verify,roomId:rooms.find(r=>r.room_type_id!==requestBody.roomTypeId).id},409);
 // Locked room and maintenance checks fail without recording a payment or reservation.
 await request('/operations/blocks',{roomId:rooms[4].id,startDate:day,endDate:departure,reason:'Online request allocation conflict'},201);
 await request('/booking-requests/'+online.id+'/verify-and-allocate',verify,409);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM reservations')).rows[0].n,bookingsBefore);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM folio_payments WHERE idempotency_key=$1',[online.id])).rows[0].n,0);
 // Existing overlapping booking is also rejected.
 const conflict=await request('/operations/reservations',{guestId:guest.id,roomId:rooms[5].id,arrivalDate:day,departureDate:departure},201);
 await request('/booking-requests/'+online.id+'/verify-and-allocate',{...verify,roomId:rooms[5].id},409);
 // Receptionist can approve, verify actual advance and allocate, with saved quote rates.
 await db.query("UPDATE staff SET active=true,role='RECEPTIONIST',must_change_password=false WHERE id=$1",[staff.id]);
 token=(await request('/auth/login',{email:staff.email,password:'Reset-Password-123'},201)).accessToken;
 await request('/booking-requests');
 const allocated=await request('/booking-requests/'+online.id+'/verify-and-allocate',{...verify,roomId:rooms[6].id},201);
 const replay=await request('/booking-requests/'+online.id+'/verify-and-allocate',{...verify,roomId:rooms[6].id},201);assert.equal(replay.reservationId,allocated.reservationId);
 await request('/booking-requests/'+online.id+'/verify-and-allocate',{...verify,roomId:rooms[6].id,reference:'DIFFERENT'},409);
 const paidFolio=await request('/billing/folios/'+allocated.folioId);assert.equal(paidFolio.balanceBeforeTaxSar,'0.00');assert.equal(paidFolio.payments.length,1);assert.equal(paidFolio.lines.length,1);
 token=customerToken;const customerBookings=await request('/guest/requests');assert.equal(customerBookings.find(q=>q.id===online.id).room_number,rooms[6].number);assert.equal(customerBookings.find(q=>q.id===online.id).status,'CONFIRMED');
 const secondOnline=await request('/guest/requests',requestBody,201);
 token=adminToken;await request('/booking-requests/'+secondOnline.id+'/approve',{},201);
 // Reuse of the same bank reference rolls back all inserts.
 const countBeforeDuplicate=(await db.query('SELECT count(*)::int AS n FROM reservations')).rows[0].n;
 await request('/booking-requests/'+secondOnline.id+'/verify-and-allocate',{...verify,roomId:rooms[7].id},409);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM reservations')).rows[0].n,countBeforeDuplicate);
 assert.equal((await db.query('SELECT status FROM booking_requests WHERE id=$1',[secondOnline.id])).rows[0].status,'AWAITING_PAYMENT');
 await request('/booking-requests/'+secondOnline.id+'/reject',{reason:'No suitable room available. Contact reception before sending payment.'},201);
 token=customerToken;assert.equal((await request('/guest/requests')).find(q=>q.id===secondOnline.id).status,'REJECTED');
 const cancelOnline=await request('/guest/requests',requestBody,201);await request('/guest/requests/'+cancelOnline.id+'/cancel',{},201);
 token=adminToken;await request('/booking-requests/'+cancelOnline.id+'/approve',{},409);
 await request('/booking-requests/'+online.id+'/reject',{reason:'Cannot reject a paid and confirmed reservation'},409);

 // Payment verification keeps the original quote even if the live rate changes later.
 token=customerToken;const rateSnapshotRequest=await request('/guest/requests',requestBody,201);
 token=adminToken;await request('/booking-requests/'+rateSnapshotRequest.id+'/approve',{},201);
 await db.query('UPDATE room_types SET nightly_rate=nightly_rate+20 WHERE id=$1',[requestBody.roomTypeId]);
 const snapAllocation=await request('/booking-requests/'+rateSnapshotRequest.id+'/verify-and-allocate',{...verify,roomId:rooms[8].id,amountSar:rateSnapshotRequest.advance_required_sar,reference:'SNAPSHOT-ADVANCE'},201);
 assert.equal((await request('/billing/folios/'+snapAllocation.folioId)).balanceBeforeTaxSar,'0.00');
 assert.equal(Number((await db.query('SELECT nightly_rate FROM reservations WHERE id=$1',[snapAllocation.reservationId])).rows[0].nightly_rate),Number(rateSnapshotRequest.advance_required_sar));
 // Acknowledging an older notification cannot hide a later payment-reference update.
 await request('/booking-requests/read',{requestId:online.id,version:1},201);
 assert.equal((await request('/booking-requests')).find(q=>q.id===online.id).unread,true);
 await request('/booking-requests/read',{requestId:online.id,version:2},201);
 assert.equal((await request('/booking-requests')).find(q=>q.id===online.id).unread,false);
 // Verify no customer can obtain billing/staff data by changing JWT audience or using staff routes.
 token=customerToken;await request('/booking-requests/'+online.id+'/approve',{},401);
 token=adminToken;
 const outsiderRequest=(await db.query("INSERT INTO customer_accounts(hotel_id,full_name,email,phone,password_hash) VALUES($1,'Other guest','other@example.com','0500000099',$2) RETURNING id",[otherHotel,hash])).rows[0];
 assert(!(await request('/booking-requests')).some(q=>q.customer_id===outsiderRequest.id));
 const outsideType=(await db.query("INSERT INTO room_types(hotel_id,name,nightly_rate,capacity) VALUES($1,'Other category',100,1) RETURNING id",[otherHotel])).rows[0];
 const outsideBooking=(await db.query('INSERT INTO booking_requests(hotel_id,customer_id,room_type_id,arrival_date,departure_date,nightly_rate,advance_required_sar) VALUES($1,$2,$3,$4,$5,100,100) RETURNING id',[otherHotel,outsiderRequest.id,outsideType.id,day,departure])).rows[0];
 await request('/booking-requests/'+outsideBooking.id+'/approve',{},409);
 await request('/booking-requests/'+outsideBooking.id+'/reject',{reason:'Denied cross hotel'},409);
 await request('/booking-requests/read',{requestId:outsideBooking.id,version:1},400);
 await request('/booking-requests/'+outsideBooking.id+'/verify-and-allocate',verify,400);
 token=customerToken;assert(!(await request('/guest/requests')).some(q=>q.id===outsideBooking.id));
 // Bound the number of active unpaid requests for one customer.
 for(let i=0;i<5;i++)await request('/guest/requests',requestBody,201);
 await request('/guest/requests',requestBody,409);token=adminToken;


 // Public contact messages reach the protected reception inbox, never public reads.
 token='';const publicRooms=await request('/public/room-types');assert.equal(publicRooms.length,4);assert(publicRooms.every(r=>!('hotel_id' in r)));
 const enquiry={fullName:'Website guest',email:'enquiry@example.com',phone:'0500012345',subject:'Planning a stay',message:'Please help me plan a room for my next visit.',website:''};
 await request('/public/contact',{...enquiry,message:'short'},400);
 await request('/public/contact',{...enquiry,website:'spam.example'},400);
 const receipt=await request('/public/contact',enquiry,201);assert.equal(receipt.deliveredTo,'RECEPTION_INBOX');
 await request('/booking-requests/enquiries',undefined,401);
 token=customerToken;await request('/booking-requests/enquiries',undefined,401);
 token=adminToken;const inbox=await request('/booking-requests/enquiries');assert.equal(inbox[0].message,enquiry.message);assert.equal(inbox[0].id,receipt.reference);
 await request('/booking-requests/enquiries/'+receipt.reference+'/read',{},201);
 assert((await request('/booking-requests/enquiries'))[0].read_at);
 const outsideEnquiry=(await db.query("INSERT INTO hotel_contact_enquiries(hotel_id,full_name,email,subject,message) VALUES($1,'Other hotel guest','other-enquiry@example.com','Other enquiry','Cross hotel message test') RETURNING id",[otherHotel])).rows[0];
 await request('/booking-requests/enquiries/'+outsideEnquiry.id+'/read',{},400);
 assert(!(await request('/booking-requests/enquiries')).some(x=>x.id===outsideEnquiry.id));
 const staffId=(await db.query("SELECT id FROM staff WHERE email='test@example.com'")).rows[0].id;
 await db.query("UPDATE staff SET role='RECEPTIONIST' WHERE id=$1",[staffId]);
 await request('/operations/rooms',undefined,401);
 token=(await request('/auth/login',{email:'test@example.com',password:'Test-Only-Password-123'},201)).accessToken;
 await request('/operations/room-types/'+types[0].id+'/rate',{nightlyRate:'90.00'},403);
 await request('/operations/blocks',{roomId:rooms[2].id,startDate:day,endDate:departure,reason:'Denied'},403);
 await request('/operations/rooms');
 await db.query("UPDATE staff SET active=false WHERE email='test@example.com'");await request('/operations/rooms',undefined,401);
 console.log('PASS:',count,'HTTP checks: staff RBAC, customer isolation, booking requests, notifications, full-advance allocation, duplicate-payment rollback, billing, checkout and VAT safeguards.');
 }finally{await app.close();await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
