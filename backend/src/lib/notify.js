// Notificações no sistema (e resumo diário por e-mail, quando o e-mail da instalação está configurado).
// Uma linha por destinatário; dedupe evita repetir o mesmo aviso.
export async function notifyUsers(db, userIds, { kind, title, body, link, dedupe }) {
  for (const uid of [...new Set(userIds)]) {
    await db.query(`insert into notifications (org_id, user_id, kind, title, body, link, dedupe_key) values ($1,$2,$3,$4,$5,$6,$7)
                    on conflict (org_id, user_id, dedupe_key) where dedupe_key is not null do nothing`,
    [db.orgId, uid, kind, title, body || null, link || null, dedupe || null]);
  }
}
/** Todos os membros ativos da organização com a permissão (e com acesso à empresa, se informada). */
export async function usersWithPerm(db, perm, companyId = null) {
  const { rows } = await db.query(`select m.user_id from memberships m join roles r on r.id=m.role_id join users u on u.id=m.user_id
     where m.org_id=$1 and m.active and u.active and $2 = any(r.permissions)
       and ($3::uuid is null or m.company_ids is null or cardinality(m.company_ids)=0 or $3 = any(m.company_ids))`, [db.orgId, perm, companyId]);
  return rows.map((r) => r.user_id);
}
export async function notifyPerm(db, perm, { exceptUser = null, companyId = null, ...n }) {
  const ids = (await usersWithPerm(db, perm, companyId)).filter((id) => id !== exceptUser);
  await notifyUsers(db, ids, n);
}
