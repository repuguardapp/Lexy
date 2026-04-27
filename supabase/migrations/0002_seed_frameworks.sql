-- Seed reference data: legal frameworks and locale → country → framework map.
-- The mapping below is what powers the UI default selection: a Japanese-speaking
-- user from JP gets APPI pre-selected; a French user from FR gets GDPR + AI Act.

insert into public.legal_frameworks (id, name, jurisdiction, authority, citation_style)
values
  ('gdpr',     'General Data Protection Regulation',     'EU',    'European Data Protection Board',                'article'),
  ('eu_ai_act','EU AI Act (Regulation 2024/1689)',       'EU',    'European AI Office',                            'article'),
  ('lgpd',     'Lei Geral de Proteção de Dados',         'BR',    'ANPD',                                          'article'),
  ('appi',     'Act on the Protection of Personal Information', 'JP', 'Personal Information Protection Commission', 'article'),
  ('ccpa',     'California Consumer Privacy Act / CPRA', 'US-CA', 'California Privacy Protection Agency',          'section'),
  ('pipeda',   'Personal Information Protection and Electronic Documents Act', 'CA', 'OPC',                       'section'),
  ('uk_gdpr',  'UK GDPR + Data Protection Act 2018',     'UK',    'Information Commissioner''s Office',            'article')
on conflict (id) do update set
  name = excluded.name,
  jurisdiction = excluded.jurisdiction,
  authority = excluded.authority,
  citation_style = excluded.citation_style;

-- Native locales
insert into public.locale_frameworks (locale, country, framework_id, is_default) values
  ('en','US','ccpa',   true),
  ('en','GB','uk_gdpr',true),
  ('en','IE','gdpr',   true),
  ('en','IE','eu_ai_act',false),
  ('en','CA','pipeda', true),
  ('fr','FR','gdpr',   true),
  ('fr','FR','eu_ai_act',false),
  ('fr','BE','gdpr',   true),
  ('fr','LU','gdpr',   true),
  ('es','ES','gdpr',   true),
  ('es','ES','eu_ai_act',false),
  ('es','MX','gdpr',   false),
  ('de','DE','gdpr',   true),
  ('de','DE','eu_ai_act',false),
  ('de','AT','gdpr',   true),
  ('pt-br','BR','lgpd',true),
  ('ja','JP','appi',   true)
on conflict do nothing;
