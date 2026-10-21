-- Pagar uma conta do associado (mensalidade, fiado…) com o crédito que ele tem no RUSTEN.
-- A baixa usa a forma 'credito_rusten'; o RUSTEN fica sabendo pelo retorno (/payments) como 'uso_credito' (e 'estorno_uso_credito').
alter table settlements drop constraint if exists settlements_method_check;
alter table settlements add constraint settlements_method_check check (method in ('pix','boleto','dinheiro','cartao','transferencia','outro','credito_rusten'));
alter table integration_feed drop constraint if exists integration_feed_type_check;
alter table integration_feed add constraint integration_feed_type_check check (type in ('pagamento','estorno','uso_credito','estorno_uso_credito'));
