import type { Metadata } from 'next';
export const metadata: Metadata = {title:'PK-Hotels | Management',description:'PK-Hotels staff management portal'};
export default function RootLayout({children}:{children:React.ReactNode}) {
 return <html lang="en"><body style={{margin:0,fontFamily:'Arial, sans-serif',background:'#f5f7fb',color:'#17243a'}}>{children}</body></html>;
}
