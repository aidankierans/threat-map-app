import { expect, it } from 'vitest';
import { runBuild } from './run.js';
import { caseReview, parseCase } from '../app/case-codec.js';
import { deriveCaseStudy } from '../app/case-derive.js';
import { buildGraph } from '../app/selectors.js';
it('builds a standalone case with resolved nodes and sources', () => {
 const result=runBuild({write:false});
 expect(result.errors).toEqual([]);
 expect(result.index.nodes).toHaveLength(14);
 expect(Object.keys(result.references)).toEqual(['metr-huggingface-investigation']);
 expect(result.index.caseStudies!.some(d=>d.identity.analysisId==='collective-intrusion')).toBe(true);
 const doc=parseCase(result.index.caseStudies!.find(d=>d.identity.analysisId==='collective-intrusion'),result.index);
 expect(caseReview(doc,result.index)).toEqual([]);
 expect(doc.content.stories[0].occurrences.some(o=>o.node==='FM-networkpivot')).toBe(true);
 expect(buildGraph(result.index).byId.has('E-collectiveattack')).toBe(true);
 expect(deriveCaseStudy).toBeTypeOf('function');
});
