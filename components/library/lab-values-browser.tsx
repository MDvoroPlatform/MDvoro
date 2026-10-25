'use client';

import { useMemo, useState } from 'react';
import { useI18n } from '@/components/i18n/provider';

export type LabValueRow = { id: string; name: string; category: string; reference_range: string; unit: string; si_reference_range: string; si_unit: string; population: string; source_reference: string };
const categoryNames = {
  en: { all:'All categories',hematology:'Hematology',electrolytes:'Electrolytes',renal:'Renal',liver:'Liver',endocrine:'Endocrine',other:'Other',empty:'No approved values yet',emptyDesc:'The clinical reference library will show entries after an administrator adds sourced values and approves them.',adult:'Population',range:'Conventional',si:'SI units',source:'Source' },
  he: { all:'כל הקטגוריות',hematology:'המטולוגיה',electrolytes:'אלקטרוליטים',renal:'כליות',liver:'כבד',endocrine:'אנדוקרינולוגיה',other:'אחר',empty:'אין ערכים מאושרים עדיין',emptyDesc:'הספרייה תציג ערכים לאחר שמנהל יוסיף מקורות ויאשר אותם.',adult:'אוכלוסייה',range:'טווח רגיל',si:'יחידות SI',source:'מקור' },
  ar: { all:'كل الفئات',hematology:'أمراض الدم',electrolytes:'الشوارد',renal:'الكلى',liver:'الكبد',endocrine:'الغدد الصماء',other:'أخرى',empty:'لا توجد قيم معتمدة بعد',emptyDesc:'ستظهر القيم بعد أن يضيف المسؤول قيماً موثقة ويعتمدها.',adult:'الفئة',range:'الوحدات التقليدية',si:'وحدات SI',source:'المصدر' },
  ru: { all:'Все категории',hematology:'Гематология',electrolytes:'Электролиты',renal:'Почки',liver:'Печень',endocrine:'Эндокринология',other:'Другое',empty:'Пока нет одобренных значений',emptyDesc:'Значения появятся после добавления источников и одобрения администратором.',adult:'Группа',range:'Обычные единицы',si:'Единицы СИ',source:'Источник' },
} as const;
const categories = ['all','hematology','electrolytes','renal','liver','endocrine','other'] as const;

export function LabValuesBrowser({ values }: { values: LabValueRow[] }) {
  const { locale } = useI18n();
  const t = categoryNames[locale];
  const [category, setCategory] = useState<(typeof categories)[number]>('all');
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => values.filter(value => (category==='all'||value.category===category) && `${value.name} ${value.category} ${value.population}`.toLowerCase().includes(query.trim().toLowerCase())), [category,query,values]);
  return <div className="lab-values-browser"><div className="library-toolbar"><div className="library-toolbar-search"><input aria-label={locale==='ar'?'ابحث في القيم المخبرية':'Search lab values'} value={query} onChange={event=>setQuery(event.target.value)} placeholder={locale==='ar'?'ابحث عن تحليل…':'Search analytes…'}/></div><span className="library-result-count">{filtered.length}/{values.length}</span></div><div className="lab-category-tabs" role="group" aria-label={t.all}>{categories.map(item=><button type="button" key={item} className={`btn btn-sm${category===item?' btn-primary':''}`} aria-pressed={category===item} onClick={()=>setCategory(item)}>{t[item]}</button>)}</div>{filtered.length?<div className="lab-value-grid">{filtered.map(value=><article className="card card-pad lab-value-card" key={value.id}><div className="panel-head"><div><div className="eyebrow">{t[value.category as keyof typeof t] ?? value.category}</div><h2>{value.name}</h2></div><span className="lab-population">{value.population}</span></div><div className="lab-ranges"><div><span>{t.range}</span><strong>{value.reference_range} <small>{value.unit}</small></strong></div><div><span>{t.si}</span><strong>{value.si_reference_range} <small>{value.si_unit}</small></strong></div></div><p className="lab-source"><b>{t.source}:</b> {value.source_reference}</p></article>)}</div>:<section className="card card-pad"><div className="empty"><h2>{t.empty}</h2><p>{t.emptyDesc}</p></div></section>}</div>;
}
