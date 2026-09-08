import type {Metadata} from "next";
import "./globals.css";
import "./brand.css";
export const metadata:Metadata={title:"Dink Lounge Pickle Court",description:"View court availability and book outdoor pickleball in Maramag, Bukidnon."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
