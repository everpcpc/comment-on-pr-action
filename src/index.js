/**
 * Create/Update Comment on Pull Request
 */

const fs = require('fs');
const core = require('@actions/core');
const github = require('@actions/github');
const { Octokit } = require('@octokit/rest');

const token = core.getInput('token');
const octokit = new Octokit({ auth: `token ${token}` });
const context = github.context;

async function run() {
    try {
        const owner = context.repo.owner;
        const repo = context.repo.repo;

        let body = core.getInput('body');

        const files = core.getInput('files').split(',');
        const fileTypes = core.getInput('file-types').split(',');
        const fileTitles = core.getInput('file-titles').split(',');
        if (!(files.length === fileTypes.length && files.length === fileTitles.length)) {
            throw new Error(`files(${files.length}), file-types(${fileTypes.length}) and file-titles(${fileTitles.length}) must have the same length`);
        }
        if (files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                const content = fs.readFileSync(files[i], 'utf8');
                if (!content) {
                    body += `\n\n<strong>${fileTitles[i]}</strong>\n`;
                    continue
                }
                if (fileTitles[i]) {
                    body += `\n\n<details>\n<summary>Click to Expand <strong>${fileTitles[i]}</strong></summary>\n`;
                } else {
                    body += '\n';
                }

                if (fileTypes[i]) {
                    body += "\n```" + fileTypes[i] + "\n" + content + "\n```";
                } else {
                    body += `\n${content}`;
                }

                if (fileTitles[i]) {
                    body += `\n</details>`;
                }
            }
        }

        const masks = core.getInput('masks');
        const masksSplit = core.getInput('masks-split');
        if (masks) {
            let ms = masks.split(masksSplit);
            let ss = ms.map(m => m.trim()).filter(m => m);
            ss.sort(function (a, b) {
                return b.length - a.length;
            });
            for (let s in ss) {
                body = body.replaceAll(ss[s], '***');
            }
        }

        const identifier = core.getInput('identifier');
        const identifierDoc = `<!-- ${identifier} -->`

        body += "\n" + identifierDoc;

        if (!context.eventName.includes('pull_request')) {
            core.info(`current context ${context.eventName} is not pull_request, skipping comment`);
            return false;
        }
        number = context.payload.pull_request.number;


        async function listComments(page = 1) {
            let { data: comments } = await octokit.issues.listComments({
                owner,
                repo,
                issue_number: number,
                per_page: 100,
                page,
            });
            if (comments.length >= 100) {
                comments = comments.concat(await listComments(page + 1));
            }
            return comments;
        }

        const commentList = await listComments();
        let comments = [];
        commentList.forEach(item => {
            if (item.body.includes(identifierDoc)) {
                comments.push({
                    id: item.id,
                    auth: item.user.login,
                    body: item.body,
                });
            }
        });

        if (comments.length === 0) {
            const { data } = await octokit.issues.createComment({
                owner,
                repo,
                issue_number: number,
                body,
            });
            core.info(`create-comment success!`);
            core.setOutput('comment-id', data.id);
        } else if (comments.length === 1) {
            let commentId = comments[0].id;
            if (!body) {
                await octokit.issues.deleteComment({
                    owner,
                    repo,
                    comment_id: commentId,
                });
                core.info(`delete-comment: [${commentId}] success!`);
                return false;
            }

            let params = {
                owner,
                repo,
                comment_id: commentId,
                body: body,
            };

            await octokit.issues.updateComment(params);
            core.setOutput('comment-id', commentId);
            core.info(`update-comment: [${commentId}] success!`);
        } else {
            let length = comments.length;
            core.info(`The comments length is ${length}.`);
        }

    } catch (error) {
        const allowFailure = core.getInput('allow-failure');
        if (allowFailure === 'true') {
            core.error(error.message);
        } else {
            core.setFailed(error.message);
        }
    }
}

run()
