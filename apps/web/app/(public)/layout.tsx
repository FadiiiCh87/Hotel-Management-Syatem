import { PublicHeader, PublicFooter } from '../../components/public-site';
import s from '../../components/public-site.module.css';
export default function PublicLayout({children}:{children:React.ReactNode}){return <div className={s.site}><PublicHeader/><main id="main-content">{children}</main><PublicFooter/></div>;}
