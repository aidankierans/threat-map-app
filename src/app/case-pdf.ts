import { jsPDF } from 'jspdf';
import regular from '../export-assets/regular.txt?raw';
import bold from '../export-assets/bold.txt?raw';
import type { AnalysisDocument } from './reader-state.js';
import { publicationModel, readable } from './case-publication.js';
export async function createCasePdf(doc: AnalysisDocument) {
    const model = publicationModel(doc);
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    pdf.addFileToVFS('CaseSans.ttf', regular.trim());
    pdf.addFont('CaseSans.ttf', 'CaseSans', 'normal');
    pdf.addFileToVFS('CaseSansBold.ttf', bold.trim());
    pdf.addFont('CaseSansBold.ttf', 'CaseSans', 'bold');
    const font = (size: number, weight = 'normal') => { pdf.setFont('CaseSans', weight); pdf.setFontSize(size); pdf.setTextColor(23, 35, 60); };
    const plain = (s: string) => readable(s).replace(/[\u2010-\u2015]/g, '-');
    const wrapped = (s: string, width: number) => pdf.splitTextToSize(plain(s), width) as string[];
    font(10);
    pdf.text('CASE STUDY / OVERVIEW', 15, 15);
    font(22, 'bold');
    const title = wrapped(doc.content.title, 267);
    pdf.text(title.slice(0, 2), 15, 27);
    font(10);
    const premise = wrapped(doc.content.premise, 267);
    pdf.text(premise.slice(0, 3), 15, 44);
    const top = 64, width = 267, height = 120, scale = Math.min(width / model.width, height / model.height);
    const offsetX = 15 + (width - model.width * scale) / 2, offsetY = top + (height - model.height * scale) / 2;
    const x = (v: number) => offsetX + v * scale, y = (v: number) => offsetY + v * scale;
    pdf.setLineWidth(.2);
    pdf.setDrawColor(116, 130, 155);
    for (const edge of model.edges) {
        const a = model.nodes.find(n => n.id === edge.from)!, b = model.nodes.find(n => n.id === edge.to)!;
        pdf.setLineDashPattern(edge.partial ? [1.2, 1] : [], 0);
        pdf.line(x(a.x + a.w), y(a.y + a.h / 2), x(b.x), y(b.y + b.h / 2));
    }
    pdf.setLineDashPattern([], 0);
    const nodeFont = Math.min(9, Math.max(7, scale * 38));
    model.layers.forEach((l, i) => { font(Math.min(9, nodeFont), 'bold'); pdf.text(l.label, x(i * 240 + 10), y(24)); });
    for (const n of model.nodes) {
        pdf.setFillColor(241, 245, 251);
        pdf.setDrawColor(114, 133, 164);
        pdf.roundedRect(x(n.x), y(n.y), n.w * scale, n.h * scale, 1, 1, 'FD');
        font(nodeFont);
        const lines = wrapped(n.label, n.w * scale - 3);
        const lineHeight = nodeFont * .4;
        const max = Math.max(1, Math.floor((n.h * scale - 3) / lineHeight));
        const visible = lines.slice(0, max);
        if (lines.length > max)
            visible[max - 1] = visible[max - 1].replace(/.{3}$/, '...');
        pdf.text(visible, x(n.x) + 1.5, y(n.y) + 3, { lineHeightFactor: 1.12 });
    }
    font(8);
    pdf.text('Connections represent prerequisites; dashed lines are incomplete. Full labels, notes and sources follow.', 15, 194);
    let cursor = 20;
    const nextPage = () => { pdf.addPage('a4', 'portrait'); cursor = 20; };
    const heading = (s: string) => { if (cursor > 252)
        nextPage(); font(16, 'bold'); for (const line of wrapped(s, 180)) {
        if (cursor > 278)
            nextPage();
        pdf.text(line, 15, cursor);
        cursor += 7;
    } cursor += 3; };
    const paragraph = (s: string, label?: string) => {
        if (!s)
            return;
        if (label) {
            if (cursor > 257)
                nextPage();
            font(10, 'bold');
            pdf.text(label, 15, cursor);
            cursor += 6;
        }
        font(10);
        for (const line of wrapped(s, 180)) {
            if (cursor > 276)
                nextPage();
            font(10);
            pdf.text(line, 15, cursor);
            cursor += 4.8;
        }
        cursor += 4;
    };
    nextPage();
    heading(doc.content.title);
    paragraph(doc.content.premise, 'Premise');
    paragraph(doc.content.interpretation, 'Interpretation');
    paragraph('This is a snapshot of the case and the included map descriptions. Incomplete prerequisites, assumptions and assessments are retained. Timeline order is explanatory and does not by itself establish chronology.');
    heading('Steps');
    for (const s of model.steps)
        paragraph(`${s.number}. ${s.title}`);
    for (const step of model.steps) {
        nextPage();
        heading(`${step.number}. ${step.title}`);
        paragraph(step.caption, "Author's note");
        paragraph(step.narrative, 'Additional explanation');
        paragraph(step.actors.join(', '), 'Actors');
        for (const claim of step.claims) {
            heading(claim.label);
            paragraph(claim.detail, 'Concrete detail');
            paragraph(claim.status, 'Status');
            paragraph(claim.argument, 'Prerequisites');
            paragraph(claim.assumption, 'Assumption');
            paragraph(claim.judgments, 'Assessments');
        }
    }
    for (const node of model.map.nodes) {
        nextPage();
        heading(node.label);
        paragraph(`${node.layer} | ${node.status} | ${node.provenance}`);
        paragraph(model.map.descriptions[node.id]?.text ?? 'No description included.');
        paragraph((model.map.descriptions[node.id]?.cites ?? []).map(k => { const r = model.map.references[k]; return `${r.title}${r.year ? ' (' + r.year + ')' : ''}\n${r.url}`; }).join('\n\n'), 'Sources');
    }
    nextPage();
    heading('Context and assessments');
    paragraph(doc.content.context.title);
    paragraph(doc.content.context.description);
    for (const f of doc.content.context.facts)
        paragraph(f.description, f.label);
    for (const m of doc.content.context.mappings)
        paragraph(`${m.relation} / ${m.effect}\n${m.note}\n${m.sources.map(s => s.label).join('; ')}`, 'Context mapping');
    for (const j of doc.content.judgments)
        paragraph(`${j.value}\n${j.note}\n${j.sources.map(s => s.label).join('; ')}`, 'Assessment');
    if (doc.content.archivedStories.length) {
        nextPage();
        heading('Archived stories');
        for (const archive of doc.content.archivedStories) {
            heading(archive.story.title);
            paragraph(JSON.stringify(archive, null, 2));
        }
    }
    nextPage();
    heading('Bibliography');
    for (const r of Object.values(model.map.references)) {
        heading(r.title);
        paragraph([r.authors, r.year, r.venue].filter(Boolean).join(' | '));
        paragraph(r.url);
    }
    const pages = pdf.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        pdf.setPage(i);
        font(8);
        pdf.setTextColor(100, 113, 135);
        pdf.text(`${i} / ${pages}`, pdf.internal.pageSize.getWidth() - 25, pdf.internal.pageSize.getHeight() - 9);
    }
    pdf.setProperties({ title: doc.content.title, subject: 'Case study with included map data', creator: 'Threat map application' });
    return pdf;
}
