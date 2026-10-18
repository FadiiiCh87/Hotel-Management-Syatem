import Link from 'next/link';
import type { Metadata } from 'next';
import RoomCategories from '../../../components/room-categories';
import { StayCta, FAQs } from '../../../components/public-site';
import s from '../../../components/public-site.module.css';
export const metadata:Metadata={title:'Our rooms',description:'Explore Normal, Standard, Deluxe and Super VVIP room categories at PK-Hotels, with current rates in SAR.',alternates:{canonical:'/rooms'}};
export default function Rooms(){return <><div className={s.breadcrumbs}><Link href="/">Home</Link> / Our rooms</div><section className={s.pageIntro}><span className={s.eyebrow}>THE ROOM COLLECTION</span><h1>Find the stay<br/>that <em>fits your plans.</em></h1><p>From a straightforward visit to our highest room category, explore your options and let reception help you plan the details.</p></section><section className={`${s.section} ${s.sandSection}`}><RoomCategories/><div className={s.softNotice}>Room features, guest capacity and special requirements are confirmed by reception before your stay. A booking request does not hold a room; allocation follows full advance verification and an availability check.</div></section><section className={`${s.section} ${s.faqLayout}`}><div><span className={s.eyebrow}>A LITTLE HELP CHOOSING</span><h2>Before you<br/><em>make yourself at home.</em></h2></div><FAQs/></section><StayCta/></>;}
