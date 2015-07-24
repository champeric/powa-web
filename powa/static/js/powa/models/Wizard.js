define(['backbone', 'powa/models/DataSourceCollection', 'jquery'], function(Backbone, DataSourceCollection, $){

    var computeDistance = function(path){
        var total_cost = 0;
        for(var i=0; i<path.length - 1;i++){
            var current_node = path[i],
                next_node = path[i+1];
            var link = current_node.links[next_node.id];
            var base = link.samerel ? 0 : 5;
            if(!link){
                throw "Uncomputable path !";
            }
            total_cost += link.value + base;
        }
        return total_cost;
    }

    var TSPStupidSolver = function(nodes) {
        var start;
        var nodesById = {};
        for(var i=0; i<nodes.length; i++){
            if(nodes[i].id == "start"){
                start = nodes[i];
            } else {
               nodesById[nodes[i].id] = nodes;
            }
        }
        var current_node = start;
        var current_path = [];
        while(!_.isEmpty(nodesById)){
            /* The heuristic is a bit tricky here:
             * We want the algorithm to go at the least expensive option, IF it
             * is on the same relation.
             *
             * If it isn't, then we want to go to the most expensive option,
             * knowing the other ones are basically free after that.
             */
            var unvisited_targets = _.filter(current_node.links, function(link){
                return nodesById[link.target.id] != undefined;
            });
            var unvisited_samerel_targets = _.filter(unvisited_targets, function(link){
                return link.samerel;
            });
            /* We still have more predicate to optimize for this table */
            if(unvisited_samerel_targets.length > 0){
                var next_path =  _.min(unvisited_samerel_targets, function(link){
                    return link.value;
                });
                current_node = next_path.target;
                current_path.push(next_path);
                delete nodesById[current_node.id];
            } else {
                /* Lets jump to the most comprehensive index for another table */
                var next_path = _.max(unvisited_targets, function(link){
                    return link.target.quals.length;
                });
                current_node = next_path.target;
                current_path.push(next_path);
                delete nodesById[current_node.id];
            }
        }
        return current_path;
    }

    var TSPSolver = function(nodes){
        // Randomize the nodes list
        var nodes = nodes.slice(0);
        // Start with the start node
        var H = []
        H.push(nodes.shift());
        nodes = _.shuffle(nodes);
        // Pick any node and generate H = (Start,n)
        H.push(nodes.shift());
        // While not every node is in H:
        while(nodes.length > 0){
            var n = nodes.shift();
            var bestH = null,
                bestCost = null;
            // For each remaining node
            for(var i=0; i<H.length;i++){
                var newH = H.slice(0);
                newH.splice(i+1, 0, n);
                var newCost = computeDistance(newH);
                if((!bestH) || newCost < bestCost){
                    bestH = newH;
                    bestCost = newCost;
                }
            }
            H = bestH;
        }
        return H;
    }


    var QualCollection = Backbone.Collection.extend({
        comparator: function (qual1, qual2){
            if(qual1.get("relid") != qual2.get("relid")){
                return qual1.get("relid") - qual2.get("relid")
            }
            if(qual1.get("attnum") != qual2.get("attnum")){
                return qual1.get("attnum") - qual2.get("attnum");
            }
            if(qual1.get("opno") != qual2.get("opno")){
                return qual1.get("opno") - qual2.get("opno");
            }
            return 0;
        }
    });

    var make_attrid = function(qual){
        return "" + qual.get("relid") + "/" + qual.get("attnum");
    }


    var make_links = function (node1, node2) {
        // This functions assumes that qual1.quals and qual2.quals are sorted
        // according to the (relid,attnum,opno) tuple.
        // This is basically a merge-join.
        var idx1 = 0, idx2 = 0, l1 = node1.quals.models, l2 = node2.quals.models;
        var overlap = [];
        var attrs1 = {}, attrs2 = {};
        var relid1, relid2;
        var links = [];
        var missing1 = [], missing2 = [];
        while(true){
            if(idx1 >= l1.length || idx2 >= l2.length){
                for(var i = idx1; i < l1.length; i++){
                    missing1.push(l1[i]);
                }
                for(var i = idx2; i < l2.length; i++){
                    missing2.push(l2[i]);
                }
                break;
            }
            var q1 = l1[idx1],
                q2 = l2[idx2],
                attrid1 = make_attrid(q1),
                attrid2 = make_attrid(q2);
            if(attrs1[attrid1] === undefined){
                attrs1[attrid1] = false;
            }
            if(attrs2[attrid2] === undefined){
                attrs2[attrid2] = false;
            }
            if(relid1 && relid1 != q1.get("relid")){
                throw "A single qual should NOT touch more than one table!";
            }
            relid1 = q1.get("relid");
            if(relid2 && relid2 != q2.get("relid")){
                throw "A single qual should NOT touch more than one table!";
            }
            relid2 = q2.get("relid");
            if(q1.get("relid") == q2.get("relid") &&
               q1.get("attnum") == q2.get("attnum")){
                var common_ams = _.filter(q1.get("indexams"), function(indexam){
                    return q2.get("indexams").indexOf(indexam) > -1;
                });
                if(common_ams.length > 0){
                    overlap.push({
                        relid: q1.get("relid"),
                        queryids: [q1.get("queryid"), q2.get("queryid")],
                        attnum: q1.get("attnum"),
                        relname: q1.get("relname"),
                        attname: q1.get("attname"),
                        indexams: common_ams
                    });
                    attrs1[attrid1] = true;
                    attrs2[attrid2] = true;
                }
                idx1++;
                idx2++;
                continue;
            } else {
                if(node1.quals.comparator.call(q1, q1, q2) > 0){
                    var newq2 = _.clone(q2);
                    newq2.qualid = node2.qualid;
                    missing1.push(newq2);
                    idx1++;
                } else {
                    var newq1 = _.clone(q1);
                    newq1.qualid = node1.qualid;
                    missing2.push(newq1);
                    idx2++;
                }
            }
        }
        var samerel = relid1 != undefined && relid2 != undefined && relid1 == relid2;
        var link1 = { source: node2, target: node1, samerel: samerel, overlap: overlap, missing: missing1 },
            link2 = { source: node1, target: node2, samerel: samerel, overlap: overlap, missing: missing2 };
        var links = [];
        if(link1.target.id != 'start'){
            links.push(link1);
            node1.links[node2.id] = link2;
        }
        if(link2.target.id != 'start'){
            links.push(link2);
            node2.links[node1.id] = link1;
        }
        return [link1, link2];
    }

    return Backbone.Model.extend({
        initialize: function(){
            this.set("stage", "Starting wizard...");
            this.set("progress", 0);
            this.startNode = { label: "Start", type: "startNode", quals: new QualCollection(), links: {}, id: "start"};
            this.set("nodes", [this.startNode]);
            this.set("links", []);
            this.set("shortest_path", []);
            this.listenTo(this.get("datasource"), "metricgroup:dataload", this.update, this);
            this.listenTo(this.get("datasource"), "startload", this.starload, this);
        },

        startload: function(){
            this.trigger("widget:update_progress", "Fetching top 20 quals...", 0);
        },

        /* Compute the links between quals.
         *
         * Two types of links are considered:
         *  - Almost-free links, where two predicates can be grouped together
         *  using a single index
         *  - Expensive links, where a new index has to be created.
         *
         * */
        computeLinks: function(nodes){
            var links = [];
            for(var i=0; i <nodes.length; i++){
                var firstnode = nodes[i];
                for(var j=0; j<i; j++){
                    var secondnode = nodes[j];
                    links = links.concat( make_links(firstnode, secondnode));
                }
            }
            return links;
        },

        update: function(quals){
            this.trigger("widget:update_progress", "Suggest indexes...", 0);
            var total_quals = _.size(quals);
            _.each(quals, function(qual, index){
                var node = {
                    label: qual.where_clause,
                    type: "qual",
                    quals: new QualCollection(qual.quals),
                    links: {},
                    id: qual.qualid
                }
                this.get("nodes").push(node);
            }, this);
            var links = this.computeLinks(this.get("nodes"));
            _.each(links, function(link, inde){
                this.valueLink(link);
            }, this);
            this.set("links", links);
            var stupidShortPath = TSPStupidSolver(this.get("nodes"), this.get("links"));
            this.set("shortest_path", stupidShortPath);
            this.trigger("wizard:update_graph", this);
        },

        valueLink: function(link){
            // A link from a source to a destination with one target being
            // entirely comprised in the source is valued as -1000 *
            // nbattributes: an index for one will cover the other one.
            // A link from a source to a destination in another relation is
            // equal to 1000, minus the number of attributes present in the
            // qual.
            // The reasoning is that it will be far cheaper to explore the
            // "biggest" indexes first, and then the other ones.
            var missing = _.map(link.missing, function(qual){
                return qual.attributes;
            });
            if (missing.length) {
                console.log(link.target);
                var shallowtarget = _.clone(link.target);
                shallowtarget.quals = _.map(shallowtarget.quals.models, function(m){
                    return m.attributes;
                });
                delete shallowtarget.links;
                $.ajax({
                    url: '/database/' + this.get("database") + '/suggest/',
                    data: JSON.stringify({
                        qual: shallowtarget
                    }),
                    type: 'POST',
                    contentType: 'application/json'
                });
            } else {
                link.value = -1000 * link.overlap.length;
            }
        }
    }, {
        fromJSON: function(jsonobj){
            var group = DataSourceCollection.get_instance();
            jsonobj.datasource = group.findWhere({name: jsonobj.datasource});
            if(jsonobj.datasource === undefined){
                throw ("The content source could not be found.");
            }
            return new this(jsonobj);
        }
    });
});