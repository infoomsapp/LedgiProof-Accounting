// PATH: tests/integration/recurring.itest.ts
// Exercises the recurring-invoice generator: reuses next_invoice_number +
// compute_invoice_totals, links recurring_id, and advances the schedule.
import { it, expect } from 'vitest'
import { describeDb, withRollback, seedRefs, num } from './db'

describeDb('SQL: generate_recurring_invoice', () => {
  it('generates an invoice ($270) and advances the schedule one month', async () => {
    await withRollback(async (c) => {
      const { orgId, clientId, userId } = await seedRefs(c)

      const rid = (await c.query(
        `INSERT INTO recurring_invoices (org_id, client_id, title, currency, frequency, start_date, next_run_date, net_days, auto_send, created_by)
         VALUES ($1,$2,'Monthly retainer','USD','monthly',current_date,current_date,15,false,$3)
         RETURNING id`, [orgId, clientId, userId])).rows[0].id
      await c.query(
        `INSERT INTO recurring_invoice_items (recurring_id, org_id, sort_order, item_type, description, quantity, unit_price, tax_rate)
         VALUES ($1,$2,0,'service','Bookkeeping',2,100,10),($1,$2,1,'product','Software',1,50,0)`, [rid, orgId])

      const inv = (await c.query('SELECT generate_recurring_invoice($1) AS id', [rid])).rows[0].id
      expect(inv).toBeTruthy()

      const invRow = (await c.query('SELECT total, status, recurring_id FROM invoices WHERE id=$1', [inv])).rows[0]
      const items  = num((await c.query('SELECT count(*) AS n FROM invoice_items WHERE invoice_id=$1', [inv])).rows[0].n)
      const sched  = (await c.query('SELECT next_run_date, occurrences_generated FROM recurring_invoices WHERE id=$1', [rid])).rows[0]

      expect(items).toBe(2)
      expect(num(invRow.total)).toBe(270.00)      // 2*100=200 +10% tax 20 + 50
      expect(invRow.status).toBe('draft')          // auto_send=false
      expect(invRow.recurring_id).toBe(rid)
      expect(num(sched.occurrences_generated)).toBe(1)
      // next_run advanced by one month
      const next = new Date(sched.next_run_date).toISOString().slice(0, 10)
      const expected = (await c.query(`SELECT (current_date + interval '1 month')::date::text AS d`)).rows[0].d
      expect(next).toBe(expected)
    })
  })
})
