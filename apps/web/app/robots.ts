import type { MetadataRoute } from 'next';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',allow:'/',disallow:['/staff','/guest']},sitemap:'https://pk-hotels-web.onrender.com/sitemap.xml'};}
