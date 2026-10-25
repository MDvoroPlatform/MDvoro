-- Starter adult reference intervals for the QBank lab library.
-- These are educational ranges, not a substitute for the testing laboratory's interval.
-- Provenance stays in source_reference for review but is not shown in the student UI.
begin;

with reviewer as (
  select id from public.profiles where role::text = 'admin' order by id limit 1
),
reference_values(name,category,reference_range,unit,si_reference_range,si_unit,population,source_reference) as (
  values
    ('Red blood cells (RBC), male','hematology','5–6 million','cells/µL','5–6 × 10¹²','cells/L','Adult male','https://www.nhlbi.nih.gov/health/blood-tests'),
    ('Red blood cells (RBC), female','hematology','4–5 million','cells/µL','4–5 × 10¹²','cells/L','Adult female','https://www.nhlbi.nih.gov/health/blood-tests'),
    ('White blood cells (WBC)','hematology','4,500–10,000','cells/µL','4.5–10.0 × 10⁹','cells/L','Adult','https://www.nhlbi.nih.gov/health/blood-tests'),
    ('Platelets','hematology','140,000–450,000','/µL','140–450 × 10⁹','/L','Adult','https://www.nhlbi.nih.gov/health/blood-tests'),
    ('Hemoglobin, male','hematology','14–17','g/dL','140–170','g/L','Adult male','https://www.nhlbi.nih.gov/health/blood-tests'),
    ('Hemoglobin, female','hematology','12–15','g/dL','120–150','g/L','Adult female','https://www.nhlbi.nih.gov/health/blood-tests'),
    ('Hematocrit, male','hematology','41–50','%','0.41–0.50','L/L','Adult male','https://www.nhlbi.nih.gov/health/blood-tests'),
    ('Hematocrit, female','hematology','36–44','%','0.36–0.44','L/L','Adult female','https://www.nhlbi.nih.gov/health/blood-tests'),
    ('Sodium (Na⁺)','electrolytes','133–145','mEq/L','133–145','mmol/L','Adult study interval','https://biolincc.nhlbi.nih.gov/media/studies/sprint/SPRINT_Manual_of_Procedures.pdf'),
    ('Potassium (K⁺)','electrolytes','3.3–5.1','mEq/L','3.3–5.1','mmol/L','Adult study interval','https://biolincc.nhlbi.nih.gov/media/studies/sprint/SPRINT_Manual_of_Procedures.pdf'),
    ('Chloride (Cl⁻)','electrolytes','96–108','mEq/L','96–108','mmol/L','Adult study interval','https://biolincc.nhlbi.nih.gov/media/studies/sprint/SPRINT_Manual_of_Procedures.pdf'),
    ('Bicarbonate (CO₂)','electrolytes','22–29','mEq/L','22–29','mmol/L','Adult study interval','https://biolincc.nhlbi.nih.gov/media/studies/sprint/SPRINT_Manual_of_Procedures.pdf'),
    ('Calcium (total)','electrolytes','8.5–10.5','mg/dL','2.13–2.62','mmol/L','Adult','https://repository.niddk.nih.gov/public/study_document/AASK_Documents/AASK_MOOP/AASK_MOOP/mopSect9.pdf'),
    ('Magnesium','electrolytes','1.6–2.4','mg/dL','0.66–0.99','mmol/L','Adult','https://repository.niddk.nih.gov/public/study_document/AASK_Documents/AASK_MOOP/AASK_MOOP/mopSect9.pdf'),
    ('Phosphate (inorganic)','electrolytes','2.5–4.5','mg/dL','0.81–1.45','mmol/L','Adult','https://repository.niddk.nih.gov/public/study_document/AASK_Documents/AASK_MOOP/AASK_MOOP/mopSect9.pdf'),
    ('Urea nitrogen (BUN)','renal','6–23','mg/dL','2.14–8.21','mmol/L','Adult study interval','https://biolincc.nhlbi.nih.gov/media/studies/sprint/SPRINT_Manual_of_Procedures.pdf'),
    ('Creatinine, serum','renal','0.40–1.20','mg/dL','35–106','µmol/L','Adult study interval','https://biolincc.nhlbi.nih.gov/media/studies/sprint/SPRINT_Manual_of_Procedures.pdf'),
    ('Alanine aminotransferase (ALT)','liver','4–36','U/L','0.07–0.60','µkat/L','Adult typical interval','https://www.ncbi.nlm.nih.gov/books/NBK482489/'),
    ('Aspartate aminotransferase (AST)','liver','5–30','U/L','0.08–0.50','µkat/L','Adult typical interval','https://www.ncbi.nlm.nih.gov/books/NBK482489/'),
    ('Alkaline phosphatase (ALP)','liver','30–120','U/L','0.50–2.00','µkat/L','Adult typical interval','https://www.ncbi.nlm.nih.gov/books/NBK482489/'),
    ('Gamma-glutamyl transferase (GGT), male','liver','6–50','U/L','0.10–0.83','µkat/L','Adult male typical interval','https://www.ncbi.nlm.nih.gov/books/NBK482489/'),
    ('Total bilirubin','liver','0.1–1.0','mg/dL','2–17','µmol/L','Adult typical interval','https://www.ncbi.nlm.nih.gov/books/NBK482489/'),
    ('Direct bilirubin','liver','0–0.35','mg/dL','0–6','µmol/L','Adult typical interval','https://www.ncbi.nlm.nih.gov/books/NBK482489/'),
    ('Albumin','liver','3.5–5.0','g/dL','35–50','g/L','Adult typical interval','https://www.ncbi.nlm.nih.gov/books/NBK482489/'),
    ('Total protein','liver','6.0–8.0','g/dL','60–80','g/L','Adult typical interval','https://www.ncbi.nlm.nih.gov/books/NBK482489/'),
    ('Lactate dehydrogenase (LDH)','liver','50–150','U/L','0.83–2.50','µkat/L','Adult typical interval','https://www.ncbi.nlm.nih.gov/books/NBK482489/'),
    ('Thyroid-stimulating hormone (TSH)','endocrine','0.4–4.0','mIU/L','0.4–4.0','mIU/L','Adult, non-pregnant typical interval','https://www.ncbi.nlm.nih.gov/books/NBK285558/'),
    ('Free thyroxine (FT4)','endocrine','0.8–1.7','ng/dL','10.3–21.9','pmol/L','Adult typical assay interval','https://www.ncbi.nlm.nih.gov/books/NBK285558/'),
    ('Glucose, fasting','other','60–99','mg/dL','3.3–5.5','mmol/L','Adult study interval, fasting','https://biolincc.nhlbi.nih.gov/media/studies/sprint/SPRINT_Manual_of_Procedures.pdf'),
    ('Total cholesterol','other','0–200','mg/dL','0–5.18','mmol/L','Adult study interval','https://biolincc.nhlbi.nih.gov/media/studies/sprint/SPRINT_Manual_of_Procedures.pdf'),
    ('Triglycerides','other','<150','mg/dL','<1.69','mmol/L','Adult study interval','https://biolincc.nhlbi.nih.gov/media/studies/sprint/SPRINT_Manual_of_Procedures.pdf'),
    ('HDL cholesterol, male','other','>40','mg/dL','>1.03','mmol/L','Adult male study interval','https://biolincc.nhlbi.nih.gov/media/studies/sprint/SPRINT_Manual_of_Procedures.pdf'),
    ('HDL cholesterol, female','other','>50','mg/dL','>1.29','mmol/L','Adult female study interval','https://biolincc.nhlbi.nih.gov/media/studies/sprint/SPRINT_Manual_of_Procedures.pdf'),
    ('LDL cholesterol, calculated','other','0–129','mg/dL','0–3.34','mmol/L','Adult study interval','https://biolincc.nhlbi.nih.gov/media/studies/sprint/SPRINT_Manual_of_Procedures.pdf')
), inserted as (
  insert into public.lab_values(name,category,reference_range,unit,si_reference_range,si_unit,population,source_reference,status,created_by,updated_by,reviewed_by,reviewed_at)
  select v.name,v.category,v.reference_range,v.unit,v.si_reference_range,v.si_unit,v.population,v.source_reference,'approved',r.id,r.id,r.id,now()
  from reference_values v cross join reviewer r
  where not exists (
    select 1 from public.lab_values current_value
    where lower(current_value.name)=lower(v.name) and current_value.category=v.category and lower(current_value.population)=lower(v.population)
  )
  returning id,name,category
)
insert into public.content_audit_logs(actor_id,entity_type,entity_id,action,metadata)
select r.id,'lab_value',i.id,'seeded_reference_interval',jsonb_build_object('name',i.name,'category',i.category,'source','curated adult starter ranges')
from inserted i cross join reviewer r;

commit;
