import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

// Interface for our plugin's settings
interface AIJournalSettings {
	// Remote APIs
	officialOpenAIApiKey: string;
	geminiApiKey: string;
	compatibleApiKey: string;
    compatibleBaseUrl: string;
	// Local LLM
	useLocalLlm: boolean;
	localLlmBaseUrl: string;
	localLlmModelName: string;
    localLlmApiFormat: 'openai-compatible' | 'ollama-native';
}

// Default settings
const DEFAULT_SETTINGS: AIJournalSettings = {
	officialOpenAIApiKey: '',
	geminiApiKey: '',
	compatibleApiKey: '',
    compatibleBaseUrl: 'https://openrouter.ai/api/v1',
	useLocalLlm: false,
	localLlmBaseUrl: 'http://localhost:11434',
	localLlmModelName: '',
    localLlmApiFormat: 'openai-compatible',
}

// Data for Courses
const OLID_COURSES: { [key: string]: string } = {
    "OLID 500": "Foundations: Instructional Design, Training and Performance",
    "OLID 501": "Design and Delivery of Online Learning",
    "OLID 502": "Interactive Media for Learning",
    "OLID 503": "Universal Design & Accessibility",
    "OLID 504": "App Design & Task Analysis",
    "OLID 505": "Usability & Problem Solving with AI",
    "OLID 506": "Learning Performance & Project Management",
    "OLID 507": "Online Content Management",
    "OLID 508": "Design Studio with AI",
    "OLID 509": "Emerging Technologies Research Studio",
    "OLID 510": "Emerging Technologies and the Workplace",
    "OLID 511": "Story-based Learning & Gamification",
    "OLID 512": "Instructional Design Methods"
};


// Interface for a single parsed journal entry
interface JournalEntry {
    id: number;
    prompt: string;
    response: string;
    metadata: string;
}

// More robust model definition to separate display names from API IDs
interface ModelDefinition {
    id: string;
    apiId: string;
    name: string;
    family: 'openai' | 'gemini' | 'compatible' | 'local';
    type: 'model' | 'separator';
}


// The main class for our plugin
export default class AIJournalPlugin extends Plugin {
	settings: AIJournalSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new AIJournalSettingTab(this.app, this));

        const isNoteLocked = (file?: TFile | null): boolean => {
            if (!file) return false;
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
            return fm?.['journal-status'] === 'locked';
        };

        const isNoteInitialized = (file?: TFile | null): boolean => {
             if (!file) return false;
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
            return !!fm?.['course-id'];
        }

		this.addCommand({
			id: 'end-the-week',
			name: 'End the Week and Reflect',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
                if (isNoteLocked(view.file)) { new Notice("This journal is already locked."); return; }
                if (!isNoteInitialized(view.file)) { new Notice("Please add a chat entry first to initialize the note."); return; }
				new ReflectionModal(this.app, async (result) => {
					await this.endWeek(view, result);
				}).open();
			}
		});

        this.addCommand({
            id: 'add-chat-entry',
            name: 'Add AI Chat Entry',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                this.handleNewChatEntry(editor, view);
            }
        });

		const ribbonIconEl = this.addRibbonIcon('messages-square', 'Add AI Chat Entry', (evt: MouseEvent) => {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView) {
                this.handleNewChatEntry(activeView.editor, activeView);
            } else {
                new Notice('Please open a note to add a chat entry.');
            }
		});
		ribbonIconEl.addClass('ai-journal-ribbon-class');

        this.registerEvent(this.app.workspace.on('file-open', (file) => this.setReadOnlyStatus(file)));
        this.app.workspace.onLayoutReady(() => this.setReadOnlyStatus(this.app.workspace.getActiveFile()));
	}

    async handleNewChatEntry(editor: Editor, view: MarkdownView) {
        if (this.isNoteLocked(view.file)) {
            new Notice("This journal is locked and cannot be modified.");
            return;
        }

        const onChatSubmit = async (prompt: string, response: string, metadata: any) => {
            await this.addChatEntry(editor, prompt, response, metadata);
        };

        if (!this.isNoteInitialized(view.file)) {
            new CourseInfoModal(this.app, async (courseInfo) => {
                await this.app.fileManager.processFrontMatter(view.file as TFile, (fm) => {
                    fm['course-id'] = courseInfo.courseId;
                    fm['course-title'] = courseInfo.courseTitle;
                    fm['student-name'] = courseInfo.studentName;
                    fm['student-id'] = courseInfo.studentId;
                    fm['semester'] = courseInfo.semester;
                });
                const availableEntries = this.parseJournalEntries(editor.getValue());
                new ChatModal(this.app, this.settings, availableEntries, onChatSubmit).open();
            }).open();
        } else {
            const availableEntries = this.parseJournalEntries(editor.getValue());
            new ChatModal(this.app, this.settings, availableEntries, onChatSubmit).open();
        }
    }

    isNoteLocked = (file?: TFile | null): boolean => {
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        return fm?.['journal-status'] === 'locked';
    };

    isNoteInitialized = (file?: TFile | null): boolean => {
         if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        return !!fm?.['course-id'];
    }

    setReadOnlyStatus(file: TFile | null, forceLock?: boolean) {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
            const isLocked = forceLock || (file ? this.isNoteLocked(file) : false);
            activeView.containerEl.toggleClass('journal-is-locked', isLocked && activeView.file === file);
            if (isLocked && activeView.file === file) {
                new Notice("This note is locked (read-only).", 2000);
            }
        }
    }

	onunload() {
        this.app.workspace.getLeavesOfType('markdown').forEach(leaf => {
            leaf.view.containerEl.removeClass('journal-is-locked');
        });
    }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

    parseJournalEntries(content: string): JournalEntry[] {
        const entries: JournalEntry[] = [];
        const regex = /### Prompt (\d+)\s*>\s(.*?)\s*### AI Response\s*(.*?)(?=\n---\n|### Prompt|\s*$)/gs;
        
        let match;
        while ((match = regex.exec(content)) !== null) {
            const fullEntryText = match[0];
            const metadataMatch = fullEntryText.match(/\*Metadata:.*?\*/s);

            entries.push({
                id: parseInt(match[1], 10),
                prompt: match[2].replace(/> /g, ''),
                response: match[3].trim(),
                metadata: metadataMatch ? metadataMatch[0] : ''
            });
        }
        return entries;
    }

    private getCurrentPromptCount(editor: Editor): number {
        const content = editor.getValue();
        const matches = content.match(/### Prompt \d+/g);
        return matches ? matches.length : 0;
    }

	async addChatEntry(editor: Editor, prompt: string, response: string, metadata: { model: string, tokens: number, contextTokens: number }) {
        const promptCounter = this.getCurrentPromptCount(editor) + 1;
        const formattedEntry = `
---
### Prompt ${promptCounter}

> ${prompt.replace(/\n/g, '\n> ')}

### AI Response

${response}

*Metadata: Model: ${metadata.model}, Total Tokens: ${metadata.tokens} (Context: ${metadata.contextTokens})*
`;
		editor.replaceSelection(formattedEntry);
		new Notice('AI chat entry added!');
	}

	async endWeek(view: MarkdownView, reflectionText: string) {
        const file = view.file;
        if (!file) return;

        const content = view.editor.getValue();
        const journalEntries = this.parseJournalEntries(content);
        new Notice('Analyzing journal... this may take a moment.', 5000);

        const modelsUsed = new Set(journalEntries
            .map(e => {
                const match = e.metadata.match(/Model: (.*?)(,|$)/);
                return match ? match[1].trim() : null;
            })
            .filter(Boolean) as string[]
        );

        const totalTokens = journalEntries.reduce((sum, e) => {
            const match = e.metadata.match(/Total Tokens: (\d+)/);
            return sum + (match ? parseInt(match[1]) : 0);
        }, 0);

        const startTime = new Date(file.stat.ctime);
        const endTime = new Date();
        const timeToComplete = new Date(endTime.getTime() - startTime.getTime()).toISOString().substr(11, 8);

        let analytics = { mainTopics: 'N/A', learningTheory: 'N/A', idModel: 'N/A' };
        try {
            analytics = await this.getLearningAnalytics(journalEntries.map(e => e.prompt));
        } catch (e) {
            new Notice(`Could not get AI analytics: ${e.message}`, 7000);
        }

        await this.app.fileManager.processFrontMatter(file, (fm) => {
            fm['journal-status'] = 'locked';
            fm['start-time'] = startTime.toLocaleString();
            fm['end-time'] = endTime.toLocaleString();
            fm['time-to-complete'] = timeToComplete;
            fm['prompt-count'] = journalEntries.length;
            fm['total-tokens-used'] = totalTokens;
            fm['models-used'] = Array.from(modelsUsed);
            fm['main-topics'] = analytics.mainTopics;
            fm['inferred-learning-theory'] = analytics.learningTheory;
            fm['inferred-id-model'] = analytics.idModel;
        });
        
		const endOfWeekMarker = `
---
## Weekly Reflection

${reflectionText}

---
*This journal entry was locked on ${endTime.toLocaleString()}.*
`;
		
        view.editor.setValue(content + endOfWeekMarker);
        
        this.setReadOnlyStatus(file, true);
		new Notice('Week ended and all analytics saved!');
	}

    async getLearningAnalytics(prompts: string[]): Promise<{ mainTopics: string, learningTheory: string, idModel: string }> {
        if (!this.settings.officialOpenAIApiKey && !this.settings.compatibleApiKey) {
            throw new Error("Analytics requires an Official OpenAI or OpenAI-Compatible API key.");
        }
        if (prompts.length === 0) {
            return { mainTopics: 'No prompts to analyze', learningTheory: 'N/A', idModel: 'N/A' };
        }

        let analyticsApiKey: string;
        let analyticsUrl: string;
        let analyticsModel: string;

        if (this.settings.officialOpenAIApiKey) {
            analyticsApiKey = this.settings.officialOpenAIApiKey;
            analyticsUrl = 'https://api.openai.com/v1/chat/completions';
            analyticsModel = 'gpt-4o';
        } else {
            analyticsApiKey = this.settings.compatibleApiKey;
            analyticsUrl = this.settings.compatibleBaseUrl.replace(/\/+$/, '') + '/chat/completions';
            analyticsModel = 'openai/gpt-4o';
        }

        const systemPrompt = `You are an expert in instructional design and learning sciences. Analyze the following list of user prompts from a student's journal. 
        Based ONLY on the user's prompts, provide a brief analysis. Do NOT analyze the AI's hypothetical responses.
        Focus on the student's line of inquiry. Respond ONLY with a valid JSON object with three keys: "mainTopics", "learningTheory", "idModel".
        - "mainTopics": A string of 3-5 comma-separated keywords summarizing the user's topics.
        - "learningTheory": A string identifying the most relevant learning theory (e.g., "Constructivism", "Cognitivism", "Behaviorism"). If none apply, state "N/A".
        - "idModel": A string identifying the most relevant instructional design model (e.g., "ADDIE", "Gagne's Nine Events", "Bloom's Taxonomy"), including a model 
          for ADDIE(M), which is ADDIE plus Management. If none apply, state "N/A".`;

        const userPrompts = "User Prompts:\n" + prompts.map((p, i) => `${i+1}. ${p}`).join('\n');
        
        const response = await fetch(analyticsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${analyticsApiKey}` },
            body: JSON.stringify({
                model: analyticsModel,
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompts }],
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
             const errorText = await response.text();
             throw new Error(`Analytics API failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const responseText = await response.text();
        try {
            const data = JSON.parse(responseText);
            if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
                throw new Error("Invalid response structure from analytics API.");
            }
            const result = JSON.parse(data.choices[0].message.content);
            return {
                mainTopics: result.mainTopics || 'Analysis failed',
                learningTheory: result.learningTheory || 'Analysis failed',
                idModel: result.idModel || 'Analysis failed'
            };
        } catch (error) {
            console.error("Failed to parse analytics JSON:", responseText);
            throw new Error("Analytics API returned an invalid response. Check API key and Base URL.");
        }
    }
}

class PositionedModal extends Modal {
    onOpen() {
        super.onOpen();
        this.containerEl.addClass('ai-journal-modal-container');
    }

    onClose() {
        this.containerEl.removeClass('ai-journal-modal-container');
        super.onClose();
    }
}

class CourseInfoModal extends PositionedModal {
    onSubmit: (result: { courseId: string, courseTitle: string, studentName: string, studentId: string, semester: string }) => void;
    courseId: string = Object.keys(OLID_COURSES)[0];
    studentName: string = '';
    studentId: string = '';
    semester: string = 'Fall';
    year: string = new Date().getFullYear().toString();

    constructor(app: App, onSubmit: (result: any) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        super.onOpen();
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText('Initialize Journal Note');
        contentEl.createEl('p', { text: 'Please provide course information for this journal.' });

        new Setting(contentEl).setName('Student Name').addText(text => text.onChange(value => this.studentName = value));
        new Setting(contentEl).setName('Student ID (Dawgtag)').addText(text => text.onChange(value => this.studentId = value));
        new Setting(contentEl).setName('Course').addDropdown(dd => {
            Object.keys(OLID_COURSES).forEach(id => {
                dd.addOption(id, `${id}: ${OLID_COURSES[id]}`);
            });
            dd.onChange(value => this.courseId = value);
        });
        const semesterSetting = new Setting(contentEl).setName('Semester / Year');
        semesterSetting.controlEl.createEl('select', {cls: 'dropdown'}, sel => {
            sel.add(new Option("Fall")); sel.add(new Option("Spring")); sel.add(new Option("Summer"));
            sel.onchange = () => this.semester = sel.value;
        });
        semesterSetting.controlEl.createEl('input', { type: 'number', value: this.year }, input => {
            input.oninput = () => this.year = input.value;
        });

        new Setting(contentEl).addButton(btn => btn.setButtonText('Save and Continue').setCta().onClick(() => {
            if (!this.studentName || !this.courseId) {
                new Notice('Student Name and Course are required.'); return;
            }
            this.close();
            this.onSubmit({
                courseId: this.courseId, courseTitle: OLID_COURSES[this.courseId], studentName: this.studentName,
                studentId: this.studentId, semester: `${this.semester} ${this.year}`
            });
        }));
    }

    onClose() { super.onClose(); this.contentEl.empty(); }
}

class ChatModal extends PositionedModal {
    settings: AIJournalSettings;
    availableEntries: JournalEntry[];
    onSubmit: (prompt: string, response: string, metadata: { model: string, tokens: number, contextTokens: number }) => Promise<void>;
    prompt: string = '';
    selectedModelId: string;
    availableModels: ModelDefinition[] = [];
    selectedEntryIds: Set<number> = new Set();
    constructor(app: App, settings: AIJournalSettings, availableEntries: JournalEntry[], onSubmit: (...args: any[]) => Promise<void>) {
        super(app);
        this.settings = settings;
        this.availableEntries = availableEntries;
        this.onSubmit = onSubmit;
        this.buildAvailableModels();
    }
	
    private buildAvailableModels() {
		this.availableModels = [];
		if (this.settings.useLocalLlm) {
			if (this.settings.localLlmModelName) {
				this.availableModels.push({ id: 'local-llm', apiId: this.settings.localLlmModelName, name: `Local LLM: ${this.settings.localLlmModelName}`, family: 'local', type: 'model' });
			}
		} else {
			const hasOfficialOpenAI = this.settings.officialOpenAIApiKey;
			const hasGemini = this.settings.geminiApiKey;
			const hasCompatible = this.settings.compatibleApiKey;

			if (hasOfficialOpenAI) {
				this.availableModels.push({ id: 'official-gpt-5-main-mini', apiId: 'gpt-5-main-mini', name: 'OpenAI: gpt-5-main-mini', family: 'openai', type: 'model' });
                this.availableModels.push({ id: 'official-gpt-4o', apiId: 'gpt-4o', name: 'OpenAI: gpt-4o', family: 'openai', type: 'model' });
				this.availableModels.push({ id: 'official-o4-mini-high', apiId: 'o4-mini-high', name: 'OpenAI: o4-mini-high', family: 'openai', type: 'model' });
			}
			if (hasGemini) {
				if (this.availableModels.length > 0) this.availableModels.push({ id: 'sep1', apiId: '', name: '——————————', family: 'gemini', type: 'separator' });
				this.availableModels.push({ id: 'gem-2.5-pro', apiId: 'gemini-2.5-pro', name: 'Gemini: 2.5 Pro', family: 'gemini', type: 'model' });
				this.availableModels.push({ id: 'gem-2.0-flash', apiId: 'gemini-2.0-flash', name: 'Gemini: 2.0 Flash', family: 'gemini', type: 'model' });
			}
			if (hasCompatible) {
				if (this.availableModels.length > 0) this.availableModels.push({ id: 'sep2', apiId: '', name: '——————————', family: 'compatible', type: 'separator' });
				this.availableModels.push({ id: 'comp-gpt-4o', apiId: 'openai/gpt-4o', name: 'Compatible: gpt-4o', family: 'compatible', type: 'model' });
				this.availableModels.push({ id: 'comp-o4-mini-high', apiId: 'openai/o4-mini-high', name: 'Compatible: o4-mini-high', family: 'compatible', type: 'model' });
			}
		}
        this.selectedModelId = this.availableModels.find(m => m.type === 'model')?.id || '';
    }

    private estimateTokens(text: string): number { return Math.ceil(text.length / 4); }
    private updateTokenEstimate() {
        const tokenEstimateEl = this.containerEl.querySelector('.token-estimate');
        if (!tokenEstimateEl) return;
        let currentPromptTokens = this.estimateTokens(this.prompt);
        let contextTokens = 0;
        this.selectedEntryIds.forEach(id => {
            const entry = this.availableEntries.find(e => e.id === id);
            if (entry) { contextTokens += this.estimateTokens(entry.prompt) + this.estimateTokens(entry.response); }
        });
        tokenEstimateEl.setText(`Estimated Tokens: ~${currentPromptTokens + contextTokens} (Context: ${contextTokens}, New: ${currentPromptTokens})`);
    }

    onOpen() {
        super.onOpen();
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText('AI Chat Journal Entry');
        if (this.availableModels.length === 0) {
            contentEl.createEl('p', { text: 'No AI models are configured. Please check your settings.' });
            return;
        }
        new Setting(contentEl).setName('AI Model Variant').setDesc('Select the specific AI model to use.').addDropdown(dropdown => {
            this.availableModels.forEach(model => {
                const option = dropdown.addOption(model.id, model.name);
                if (model.type === 'separator') { option.disabled = true; }
            });
            dropdown.setValue(this.selectedModelId);
            dropdown.onChange(value => { this.selectedModelId = value; });
        });
        const promptTextarea = contentEl.createEl('textarea');
        promptTextarea.style.width = '100%';
        promptTextarea.style.minHeight = '150px';
        promptTextarea.placeholder = "Enter your prompt here...";
        promptTextarea.addEventListener('input', (e) => { this.prompt = (e.target as HTMLTextAreaElement).value; this.updateTokenEstimate(); });
        if (this.availableEntries.length > 0) {
            const memorySection = contentEl.createDiv();
            const memorySelectionContainer = contentEl.createDiv({ cls: 'memory-selection-container' });
            memorySelectionContainer.style.maxHeight = '150px';
            memorySelectionContainer.style.overflowY = 'auto';
            memorySelectionContainer.style.border = '1px solid var(--background-modifier-border)';
            memorySelectionContainer.style.padding = '10px';
            memorySelectionContainer.style.display = 'none';
            new Setting(memorySection).setName('Enable Conversation Memory').setDesc('Include past exchanges in this prompt to provide context.').addToggle(toggle => toggle.onChange(checked => {
                memorySelectionContainer.style.display = checked ? 'block' : 'none';
                if (!checked) {
                    this.selectedEntryIds.clear();
                    memorySelectionContainer.findAll('input[type="checkbox"]').forEach((cb: HTMLInputElement) => cb.checked = false);
                }
                this.updateTokenEstimate();
            }));
            this.availableEntries.forEach(entry => {
                const setting = new Setting(memorySelectionContainer).setName(`Prompt ${entry.id}`).setDesc(entry.prompt.substring(0, 100) + '...');
                setting.controlEl.createEl('input', { type: 'checkbox' }, (cb) => {
                    cb.onchange = (e) => {
                        const isChecked = (e.target as HTMLInputElement).checked;
                        if (isChecked) { this.selectedEntryIds.add(entry.id); } else { this.selectedEntryIds.delete(entry.id); }
                        this.updateTokenEstimate();
                    }
                });
            });
        }
        contentEl.createEl('p', { text: 'Estimated Tokens: ~0', cls: 'token-estimate' });
        this.updateTokenEstimate();
        new Setting(contentEl).addButton(button => button.setButtonText('Get Response & Add to Journal').setCta().onClick(async () => {
            if (!this.prompt.trim()) { new Notice('Prompt cannot be empty.'); return; }
            button.setButtonText('Thinking...').setDisabled(true);
            try {
                let response: string;
                let metadata: { model: string, tokens: number, contextTokens: number };
                const selectedModel = this.availableModels.find(m => m.id === this.selectedModelId);
                if (!selectedModel) { throw new Error("Could not find selected model definition."); }

                const conversationHistory = this.buildConversationHistory();
                const contextTokens = this.estimateTokens(JSON.stringify(conversationHistory.slice(0, -1)));

                let result;
                let modelNameForMetadata = selectedModel.name;

                if (selectedModel.family === 'openai' || selectedModel.family === 'compatible') {
                    result = await this.callOpenAI(conversationHistory, selectedModel.apiId, selectedModel.family === 'compatible');
                } else if (selectedModel.family === 'gemini') {
                    result = await this.callGemini(conversationHistory, selectedModel.apiId);
                } else if (selectedModel.family === 'local') {
                    result = await this.callLocalLLM(conversationHistory, selectedModel.apiId);
                    const formatString = this.settings.localLlmApiFormat === 'ollama-native' ? ' (Native)' : ' (Compatible)';
                    modelNameForMetadata += formatString;
                } else {
                    throw new Error("No valid model family selected.");
                }
                
                response = result.response;
                metadata = { model: modelNameForMetadata, tokens: result.tokens, contextTokens };
                
                await this.onSubmit(this.prompt, response, metadata);
                this.close();
            } catch (error) {
                new Notice(`Error: ${error.message}`);
                console.error(error);
            } finally {
                button.setButtonText('Get Response & Add to Journal').setDisabled(false);
            }
        }));
    }
    private buildConversationHistory(): { role: 'user' | 'model'; content: string }[] {
        const history: { role: 'user' | 'model'; content: string }[] = [];
        const sortedEntries = this.availableEntries.filter(e => this.selectedEntryIds.has(e.id)).sort((a, b) => a.id - b.id);
        for (const entry of sortedEntries) {
            history.push({ role: 'user', content: entry.prompt });
            history.push({ role: 'model', content: entry.response });
        }
        history.push({ role: 'user', content: this.prompt });
        return history;
    }

    async callOpenAI(conversationHistory: { role: string, content: string }[], modelApiId: string, isCompatible: boolean): Promise<{ response: string, tokens: number }> {
        const messages = conversationHistory.map(msg => ({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content }));
        const apiKey = isCompatible ? this.settings.compatibleApiKey : this.settings.officialOpenAIApiKey;
        const baseUrl = isCompatible ? this.settings.compatibleBaseUrl : 'https://api.openai.com/v1';
		const finalUrl = isCompatible ? baseUrl.replace(/\/+$/, '') + '/chat/completions' : baseUrl + '/chat/completions';

        const response = await fetch(finalUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model: modelApiId, messages: messages })
        });
        if (!response.ok) {
            const errorText = await response.text();
            try {
                const errorData = JSON.parse(errorText);
                const errorMessage = errorData.error?.message || JSON.stringify(errorData);
                throw new Error(`OpenAI API Error: ${errorMessage}`);
            } catch (e) { throw new Error(`OpenAI API Error: ${response.status} ${response.statusText} - ${errorText}`); }
        }
        const data = await response.json();
        const content = data.choices[0].message.content;
        const totalTokens = data.usage?.total_tokens || this.estimateTokens(JSON.stringify(messages) + content);
        return { response: content, tokens: totalTokens };
    }

    async callGemini(conversationHistory: { role: 'user' | 'model', content: string }[], modelApiId: string): Promise<{ response: string, tokens: number }> {
        const apiKey = this.settings.geminiApiKey;
        const url = `https://generativelanguage.googleapis.com/v1/models/${modelApiId}:generateContent?key=${apiKey}`;
        const historyForApi = conversationHistory.slice(0, -1);
        const latestPrompt = conversationHistory[conversationHistory.length - 1];
        const contents = [...historyForApi.map(msg => ({ role: msg.role, parts: [{ text: msg.content }] })), { role: latestPrompt.role, parts: [{ text: latestPrompt.content }] }];
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: contents }) });
        if (!response.ok) {
            const errorText = await response.text();
            try {
                const errorData = JSON.parse(errorText);
                const errorMessage = errorData.error?.message || JSON.stringify(errorData);
                throw new Error(`Gemini API Error: ${response.status} - ${errorMessage}`);
            } catch (e) { throw new Error(`Gemini API Error: ${response.status} ${response.statusText} - ${errorText}`); }
        }
        const data = await response.json();
        if (!data.candidates || data.candidates.length === 0) {
            const blockReason = data.promptFeedback?.blockReason;
            let errorMessage = 'No response candidate returned.';
            if (blockReason) { errorMessage += ` Reason: ${blockReason}.`; }
            throw new Error(`Gemini API Error: ${errorMessage}`);
        }
        const content = data.candidates[0].content.parts[0].text;
        const totalTokens = data.usageMetadata?.totalTokenCount || this.estimateTokens(JSON.stringify(contents) + content);
        return { response: content, tokens: totalTokens };
    }

	async callLocalLLM(conversationHistory: { role: string, content: string }[], modelApiId: string): Promise<{ response: string, tokens: number }> {
        const messages = conversationHistory.map(msg => ({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content }));
        
        let finalUrl: string;
        let body: string;
        let isNativeOllama = this.settings.localLlmApiFormat === 'ollama-native';
        
        if (isNativeOllama) {
            finalUrl = this.settings.localLlmBaseUrl.replace(/\/+$/, '') + '/api/chat';
            body = JSON.stringify({ model: modelApiId, messages: messages, stream: false });
        } else { // OpenAI-Compatible
            finalUrl = this.settings.localLlmBaseUrl.replace(/\/+$/, '') + '/v1/chat/completions';
            body = JSON.stringify({ model: modelApiId, messages: messages, stream: false });
        }

        const response = await fetch(finalUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Local LLM API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }
        const data = await response.json();

        const content = isNativeOllama ? data.message.content : data.choices[0].message.content;
        const totalTokens = (isNativeOllama ? (data.prompt_eval_count + data.eval_count) : data.usage?.total_tokens) || this.estimateTokens(JSON.stringify(messages) + content);
        
        return { response: content, tokens: totalTokens };
	}

    onClose() { super.onClose(); this.contentEl.empty(); }
}

class ReflectionModal extends PositionedModal {
	result: string;
	onSubmit: (result: string) => void;
	constructor(app: App, onSubmit: (result: string) => void) { super(app); this.onSubmit = onSubmit; }
	onOpen() {
        super.onOpen();
		const { contentEl } = this;
		contentEl.empty();
		this.titleEl.setText('End of Week Reflection');
		contentEl.createEl('p', { text: 'What did I learn this week? How did my prompting improve?' });
		const textArea = contentEl.createEl('textarea');
		textArea.style.width = '100%';
		textArea.style.minHeight = '200px';
		textArea.placeholder = 'Reflect on your interactions, challenges, and breakthroughs...';
		textArea.addEventListener('input', (e) => { this.result = (e.target as HTMLTextAreaElement).value; });
		new Setting(contentEl).addButton((btn) => btn.setButtonText("Save Reflection & Lock Note").setCta().onClick(() => {
			if (this.result && this.result.trim().length > 0) {
				this.close();
				this.onSubmit(this.result);
			} else { new Notice("Reflection cannot be empty."); }
		}));
	}
	onClose() { super.onClose(); this.contentEl.empty(); }
}

class AIJournalSettingTab extends PluginSettingTab {
	plugin: AIJournalPlugin;
	constructor(app: App, plugin: AIJournalPlugin) { super(app, plugin); this.plugin = plugin; }
	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'AI Reflection Journal Settings' });
        const warningDiv = containerEl.createDiv({ cls: 'ai-journal-warning' });
        warningDiv.createEl('h4', { text: '⚠️ Security Warning' });
        warningDiv.createEl('p', { text: 'Your API keys are sensitive information. They are stored locally. Do not share your screen, vault, or these settings.' });

		containerEl.createEl('h3', { text: 'Remote Cloud APIs' });
        new Setting(containerEl)
			.setName('OpenAI (ChatGPT) API Key')
			.setDesc('Your official API key for OpenAI\'s ChatGPT models.')
			.addText(text => text.setPlaceholder('sk-...').setValue(this.plugin.settings.officialOpenAIApiKey).onChange(async (value) => {
				this.plugin.settings.officialOpenAIApiKey = value; await this.plugin.saveSettings();
			}));
		
		new Setting(containerEl)
			.setName('Google Gemini API Key')
			.setDesc('Your official API key for Google\'s Gemini models.')
			.addText(text => text.setPlaceholder('AIza...').setValue(this.plugin.settings.geminiApiKey).onChange(async (value) => {
				this.plugin.settings.geminiApiKey = value; await this.plugin.saveSettings();
			}));
		
		new Setting(containerEl).setName('——————————').setHeading();

        new Setting(containerEl)
			.setName('OpenAI-Compatible API Key')
			.setDesc('API Key for third-party OpenAI-Compatible services (e.g., OpenRouter.ai).')
			.addText(text => text.setPlaceholder('sk-...').setValue(this.plugin.settings.compatibleApiKey).onChange(async (value) => {
				this.plugin.settings.compatibleApiKey = value; await this.plugin.saveSettings();
			}));
        new Setting(containerEl)
			.setName('OpenAI-Compatible Base URL')
			.setDesc('The Base URL for third-party OpenAI-Compatible services (e.g., OpenRouter.ai).')
			.addText(text => text.setPlaceholder('https://openrouter.ai/api/v1').setValue(this.plugin.settings.compatibleBaseUrl).onChange(async (value) => {
				this.plugin.settings.compatibleBaseUrl = value; await this.plugin.saveSettings();
			}));
		
		new Setting(containerEl).setName('——————————').setHeading();

		containerEl.createEl('h3', { text: 'Local LLM (Private)' });
		new Setting(containerEl)
			.setName('Use Local LLM')
			.setDesc('When ON, all remote cloud APIs (e.g., ChatGPT, Gemini) are disabled to ensure privacy.')
			.addToggle(toggle => toggle.setValue(this.plugin.settings.useLocalLlm).onChange(async (value) => {
				this.plugin.settings.useLocalLlm = value;
				await this.plugin.saveSettings();
				this.display();
			}));
		
		if (this.plugin.settings.useLocalLlm) {
			new Setting(containerEl)
				.setName('Local LLM Base URL')
				.setDesc('Base URL of your local LLM server (e.g., localhost:11434 for Ollama).')
				.addText(text => text.setPlaceholder('http://localhost:11434').setValue(this.plugin.settings.localLlmBaseUrl).onChange(async (value) => {
					this.plugin.settings.localLlmBaseUrl = value; await this.plugin.saveSettings();
				}));
			
            new Setting(containerEl)
                .setName('Local LLM API Format')
                .setDesc('Choose the API Endpoint format for your local LLM server.')
                .addDropdown(dropdown => dropdown
                    .addOption('openai-compatible', 'OpenAI-Compatible (/v1)')
                    .addOption('ollama-native', 'Ollama Native (/api/chat)')
                    .setValue(this.plugin.settings.localLlmApiFormat)
                    .onChange(async (value: 'openai-compatible' | 'ollama-native') => {
                        this.plugin.settings.localLlmApiFormat = value;
                        await this.plugin.saveSettings();
                    })
                );

			new Setting(containerEl)
				.setName('Model Name')
				.setDesc('The exact name of the LLM model to use (e.g., "llama3:latest", "mistral").')
				.addText(text => text.setPlaceholder('e.g., llama3:latest').setValue(this.plugin.settings.localLlmModelName).onChange(async (value) => {
					this.plugin.settings.localLlmModelName = value; await this.plugin.saveSettings();
				}));
		}
	}
}