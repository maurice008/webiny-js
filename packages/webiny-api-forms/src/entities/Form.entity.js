// @flow
import { Entity, type EntityCollection } from "webiny-entity";
import mdbid from "mdbid";

export interface IForm extends Entity {
    createdBy: Entity;
    updatedBy: Entity;
    publishedOn: ?Date;
    name: string;
    snippet: string;
    fields: Object;
    settings: Object;
    version: number;
    parent: string;
    published: boolean;
    locked: boolean;
}

export default ({ getUser, getEntities }: Object) =>
    class CmsForm extends Entity {
        static classId = "CmsForm";

        createdBy: Entity;
        updatedBy: Entity;
        publishedOn: ?Date;
        name: string;
        snippet: string;
        fields: Object;
        settings: Object;
        version: number;
        parent: string;
        published: boolean;
        locked: boolean;

        constructor() {
            super();
            const { CmsForm, SecurityUser } = getEntities();

            this.attr("createdBy")
                .entity(SecurityUser)
                .setSkipOnPopulate();

            this.attr("updatedBy")
                .entity(SecurityUser)
                .setSkipOnPopulate();

            this.attr("publishedOn")
                .date()
                .setSkipOnPopulate();

            this.attr("name")
                .char()
                .setValidators("required")
                .onSet(value => (this.locked ? this.name : value));

            this.attr("snippet")
                .char()
                .onSet(value => (this.locked ? this.snippet : value));

            this.attr("fields")
                .object()
                .onSet(value => (this.locked ? this.fields : value))
                .setValue([]);

            this.attr("triggers")
                .object()
                .onSet(value => (this.locked ? this.fields : value));

            this.attr("revisions")
                .entities(CmsForm)
                .setDynamic(() => {
                    return CmsForm.find({
                        query: { parent: this.parent },
                        sort: { version: -1 }
                    });
                });

            /*this.attr("settings")
            .model(formSettingsFactory({ entities: cms.entities, form: this }))
            .onSet(value => (this.locked ? this.settings : value));*/

            this.attr("version").integer();

            this.attr("parent").char();

            this.attr("locked")
                .boolean()
                .setSkipOnPopulate()
                .setDefaultValue(false);

            this.attr("published")
                .boolean()
                .setDefaultValue(false)
                .onSet(value => {
                    // Deactivate previously published revision
                    if (value && value !== this.published && this.isExisting()) {
                        this.locked = true;
                        this.publishedOn = new Date();
                        this.on("beforeSave", async () => {
                            // Deactivate previously published revision
                            const { CmsForm } = getEntities();
                            const publishedRev: CmsForm = (await CmsForm.findOne({
                                query: { published: true, parent: this.parent }
                            }): any);

                            if (publishedRev) {
                                publishedRev.published = false;
                                await publishedRev.save();
                            }
                        }).setOnce();
                    }
                    return value;
                });

            this.on("beforeCreate", async () => {
                if (!this.id) {
                    this.id = mdbid();
                }

                if (!this.parent) {
                    this.parent = this.id;
                }

                this.createdBy = getUser().id;

                if (!this.name) {
                    this.name = "Untitled";
                }

                this.version = await this.getNextVersion();

                /*if (!this.settings) {
                    this.settings = {
                        general: {
                            layout: (await this.category).layout
                        }
                    };
                }*/
            });

            this.on("beforeUpdate", () => {
                this.updatedBy = getUser().id;
            });

            this.on("afterDelete", async () => {
                // If the deleted form is the root form - delete its revisions
                if (this.id === this.parent) {
                    // Delete all revisions.
                    const { CmsForm } = getEntities();

                    const revisions: EntityCollection<CmsForm> = await CmsForm.find({
                        query: { parent: this.parent }
                    });

                    return Promise.all(revisions.map(rev => rev.delete()));
                }
            });
        }

        async getNextVersion() {
            const { CmsForm } = getEntities();
            const revision: null | CmsForm = await CmsForm.findOne({
                query: { parent: this.parent, deleted: { $in: [true, false] } },
                sort: { version: -1 }
            });

            if (!revision) {
                return 1;
            }

            return revision.version + 1;
        }
    };