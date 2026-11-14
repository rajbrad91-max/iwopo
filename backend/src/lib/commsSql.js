/**
 * 📞 "The same phone number" in calls & texts, as SQL (audit 2026-11-14).
 *
 * A number is stored the way the phone line sent it (+1 604…, (604) 555-…), so two are the same person when their
 * last ten digits match — on either side of the call. Built with Prisma.sql: the number is always a bound value,
 * never part of the SQL text, and the fragment drops into any privateDb.$queryRaw`…` as ${sameNumber(ten)}.
 */
import { Prisma } from '../generated/private/index.js';

export const sameNumber = (ten) => Prisma.sql`(right(regexp_replace(coalesce(from_number,''),'\\D','','g'),10) = ${ten}
    OR right(regexp_replace(coalesce(to_number,''),'\\D','','g'),10) = ${ten})`;
