"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Search, X } from "lucide-react";
import Link from "next/link";
import { fetchLibraryDocuments, fetchSubjects } from "../api/documents.api";
import type { LibraryDocument } from "../types/document";

type Pagination = {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
};

const PAGE_SIZE = 10;

function DocumentIcon({ type }: { type: string }) {
	return type === "XLSX" ? <FileSpreadsheet size={20} /> : <FileText size={20} />;
}

export function SaveView() {
	const [documents, setDocuments] = useState<LibraryDocument[]>([]);
	const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
	const [query, setQuery] = useState("");
	const [subject, setSubject] = useState("");
	const [fileType, setFileType] = useState("");
	const [sortBy, setSortBy] = useState<"createdAt" | "title" | "fileSize">("createdAt");
	const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
	const [page, setPage] = useState(1);
	const [isLoading, setIsLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState("");
	const [subjectOptions, setSubjectOptions] = useState<Array<{ id: string; name: string }>>([]);

	const loadDocuments = useCallback(async () => {
		setIsLoading(true);
		setErrorMessage("");
		try {
			const result = await fetchLibraryDocuments({ savedOnly: true, search: query.trim() || undefined, subjectId: subject || undefined, fileType: fileType || undefined, sortBy, sortOrder, page, limit: PAGE_SIZE });
			setDocuments(result.items);
			setPagination(result.pagination);
		} catch (error) {
			setDocuments([]);
			setErrorMessage(error instanceof Error ? error.message : "Unable to load saved documents.");
		} finally {
			setIsLoading(false);
		}
	}, [fileType, page, query, sortBy, sortOrder, subject]);

	useEffect(() => { void loadDocuments(); }, [loadDocuments]);

	useEffect(() => {
		void fetchSubjects().then(setSubjectOptions).catch(() => undefined);
	}, []);

	const subjects = useMemo(() => [...subjectOptions].sort((first, second) => first.name.localeCompare(second.name)), [subjectOptions]);
	const fileTypes = ["PDF", "DOCX", "PPTX", "XLSX"];

	function updateFilter<T>(setter: (value: T) => void, value: T) {
		setPage(1);
		setter(value);
	}

	function clearFilters() {
		setQuery("");
		setSubject("");
		setFileType("");
		setSortBy("createdAt");
		setSortOrder("desc");
		setPage(1);
	}

	return (
		<main className="simple-workspace-page">
			<header><p className="eyebrow">SAVED</p><h1>Saved documents</h1></header>
			<section className="saved-controls" aria-label="Search and filter saved documents">
				<label className="saved-search"><Search size={18} /><input value={query} onChange={(event) => updateFilter(setQuery, event.target.value)} placeholder="Search title, subject, tags..." /></label>
				<select value={subject} onChange={(event) => updateFilter(setSubject, event.target.value)} aria-label="Filter by subject"><option value="">All subjects</option>{subjects.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
				<select value={fileType} onChange={(event) => updateFilter(setFileType, event.target.value)} aria-label="Filter by file type"><option value="">All file types</option>{fileTypes.map((item) => <option value={item} key={item}>{item}</option>)}</select>
				<select value={`${sortBy}:${sortOrder}`} onChange={(event) => { const [nextSortBy, nextSortOrder] = event.target.value.split(":") as [typeof sortBy, typeof sortOrder]; setSortBy(nextSortBy); setSortOrder(nextSortOrder); setPage(1); }} aria-label="Sort documents">
					<option value="createdAt:desc">Newest</option><option value="createdAt:asc">Oldest</option><option value="title:asc">Name A-Z</option><option value="fileSize:desc">Largest file</option>
				</select>
				{query || subject || fileType || sortBy !== "createdAt" || sortOrder !== "desc" ? <button type="button" onClick={clearFilters}><X size={15} /> Clear filters</button> : null}
			</section>
			<p className="saved-results-count">{pagination.total} documents</p>
			<section className="saved-source-list">
				{isLoading ? <article><strong>Loading saved documents...</strong></article> : errorMessage ? <article><strong>{errorMessage}</strong></article> : documents.length ? documents.map((document) => (
					<article key={document.id}><span><DocumentIcon type={document.fileType} /></span><div><strong>{document.title}</strong><p>{document.subject} / {document.fileName}</p></div><Link href={`/hoi-ai?scope=document&document=${document.id}`}>Ask AI</Link></article>
				)) : <article><Bookmark size={20} /><strong>No saved documents found</strong></article>}
			</section>
			{pagination.totalPages > 1 ? <nav className="saved-pagination" aria-label="Saved document pages"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} aria-label="Previous page"><ChevronLeft size={18} /></button><span>Page {page} of {pagination.totalPages}</span><button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)} aria-label="Next page"><ChevronRight size={18} /></button></nav> : null}
		</main>
	);
}
