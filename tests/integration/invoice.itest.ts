// PATH: tests/integration/invoice.itest.ts
// Exercises compute_invoice_totals + payment reconciliation against real SQL.
import { it, expect, beforeAll, afterAll } from 'vitest'
import { describeDb, withRollback, seedRefs, num, hasDb } from './db'

describeDb('SQL: compute_invoice_totals + payment reconciliation', () => {
  beforeAll(() => { if (!hasDb) console.warn('DATABASE_URL not set — SQL integration tests skipped') })
  afterAll(async () => {})

  it('computes line discount + tax and invoice totals to the cent ($392.93)', async () => {
    await withRollback(async (c) => {
      const { orgId, clientId, userId } = await seedRefs(c)
      const inv = (await c.query(
        `INSERT INTO invoices (org_id, client_id, invoice_number, status, issue_date, due_date, currency, created_by)
         VALUES ($1,$2,'IT-'||substr(md5(random()::text),1,8),'draft',current_date,current_date+30,'USD',$3)
         RETURNING id`, [orgId, clientId, userId])).rows[0].id

      await c.query(
        `INSERT INTO invoice_items (invoice_id, org_id, sort_order, item_type, description, quantity, unit_price, discount_pct, tax_rate)
         VALUES ($1,$2,0,'service','Consulting',3,100.00,10,8.5),
                ($1,$2,1,'product','Widget',2,49.99,0,0)`, [inv, orgId])

      await c.query('SELECT compute_invoice_totals($1)', [inv])

      const row = (await c.query('SELECT subtotal, discount_total, tax_total, total, balance_due FROM invoices WHERE id=$1', [inv])).rows[0]
      expect(num(row.subtotal)).toBe(399.98)
      expect(num(row.discount_total)).toBe(30.00)
      expect(num(row.tax_total)).toBe(22.95)
      expect(num(row.total)).toBe(392.93)
      expect(num(row.balance_due)).toBe(392.93)
    })
  })

  it('reconciles payments from real records and flips status to paid at zero balance', async () => {
    await withRollback(async (c) => {
      const { orgId, clientId, userId } = await seedRefs(c)
      const inv = (await c.query(
        `INSERT INTO invoices (org_id, client_id, invoice_number, status, issue_date, due_date, currency, created_by)
         VALUES ($1,$2,'IT-'||substr(md5(random()::text),1,8),'sent',current_date,current_date+30,'USD',$3)
         RETURNING id`, [orgId, clientId, userId])).rows[0].id
      await c.query(
        `INSERT INTO invoice_items (invoice_id, org_id, sort_order, item_type, description, quantity, unit_price, discount_pct, tax_rate)
         VALUES ($1,$2,0,'service','Work',3,100.00,10,8.5),($1,$2,1,'product','Widget',2,49.99,0,0)`, [inv, orgId])
      await c.query('SELECT compute_invoice_totals($1)', [inv])

      // Partial payment $200
      await c.query(
        `INSERT INTO invoice_payments (invoice_id, org_id, amount, currency, payment_date, recorded_by)
         VALUES ($1,$2,200.00,'USD',current_date,$3)`, [inv, orgId, userId])
      await c.query('SELECT compute_invoice_totals($1)', [inv])
      let row = (await c.query('SELECT amount_paid, balance_due, status FROM invoices WHERE id=$1', [inv])).rows[0]
      expect(num(row.amount_paid)).toBe(200.00)
      expect(num(row.balance_due)).toBe(192.93)

      // Pay the rest
      await c.query(
        `INSERT INTO invoice_payments (invoice_id, org_id, amount, currency, payment_date, recorded_by)
         VALUES ($1,$2,192.93,'USD',current_date,$3)`, [inv, orgId, userId])
      await c.query('SELECT compute_invoice_totals($1)', [inv])
      row = (await c.query('SELECT amount_paid, balance_due, status FROM invoices WHERE id=$1', [inv])).rows[0]
      expect(num(row.amount_paid)).toBe(392.93)
      expect(num(row.balance_due)).toBe(0)
      expect(row.status).toBe('paid')
    })
  })
})
