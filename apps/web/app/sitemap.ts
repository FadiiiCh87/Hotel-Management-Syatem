import type { MetadataRoute } from 'next';
export default function sitemap():MetadataRoute.Sitemap{return ['','/about','/rooms','/contact','/booking'].map(path=>({url:'https://pk-hotels-web.onrender.com'+path,changeFrequency:'monthly',priority:path===''?1:0.7}));}
